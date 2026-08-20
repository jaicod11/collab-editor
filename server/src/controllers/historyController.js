/**
 * controllers/historyController.js
 * ─────────────────────────────────────────────────────────────────────────────
 * GET  /api/documents/:id/history        → paginated op log (version history)
 * POST /api/documents/:id/restore/:revId → restore a specific version
 */

const Operation = require("../models/Operation");
const Document = require("../models/Document");
const redisService = require("../services/redisService");
const documentService = require("../services/documentService");
const snapshotService = require("../services/snapshotService");
const historyService = require("../services/historyService");

// ── GET /api/documents/:id/history ───────────────────────────────────────────
//
// Returns COALESCED entries: consecutive operations by one author, over a
// contiguous revision range, within a session window, become a single row. The
// op log itself stays per-keystroke — OT catch-up and restore both depend on
// that fidelity — this is a read-time view.
//
// The default limit is entries, not operations. It used to be 20 raw ops, i.e.
// the last twenty characters typed.

const DEFAULT_LIMIT = 25;
const MAX_LIMIT = 100;
// How many raw operations to pull in to build one page. Typing produces one row
// per character, so a page of entries can span a lot of them.
const RAW_FETCH_CAP = 2000;

exports.getHistory = async (req, res, next) => {
  try {
    const { id: docId } = req.params;
    const { before } = req.query;

    const requested = Number(req.query.limit);
    const limit = Number.isFinite(requested)
      ? Math.min(Math.max(Math.trunc(requested), 1), MAX_LIMIT)
      : DEFAULT_LIMIT;

    // The op log embeds the literal text of every edit — owner/collaborator only.
    await documentService.assertAccess(docId, req.user.id);

    const query = { docId };
    if (before) query.revision = { $lt: Number(before) };

    const ops = await Operation.find(query)
      .populate("userId", "name email")
      .sort({ revision: -1 })
      .limit(RAW_FETCH_CAP)
      .lean();

    const grouped = historyService.coalesceOperations(ops);
    const cappedOut = ops.length === RAW_FETCH_CAP;

    // If the fetch hit the cap, the OLDEST group may be truncated mid-run — its
    // earlier operations are below the window. Drop it rather than showing a
    // partial count, and let the next page rebuild it whole.
    const usable = cappedOut && grouped.length > 1 ? grouped.slice(0, -1) : grouped;

    const page = usable.slice(0, limit);
    const hasMore = usable.length > limit || cappedOut;
    // Cursor for the next page: strictly below this page's oldest revision.
    const nextBefore = page.length ? page[page.length - 1].fromRevision : null;

    res.json({
      history: page.map(({ authorId: _authorId, isRestore: _isRestore, ...entry }) => entry),
      hasMore,
      nextBefore,
    });
  } catch (err) {
    next(err);
  }
};

// ── POST /api/documents/:id/restore/:revId ───────────────────────────────────
exports.restore = async (req, res, next) => {
  try {
    const { id: docId, revId } = req.params;

    await documentService.assertAccess(docId, req.user.id);

    const targetOp = await Operation.findById(revId).lean();
    if (!targetOp) return res.status(404).json({ message: "Version not found" });

    // The revision must belong to the document named in the path — otherwise a
    // caller could pass a revId from a document they *can* access and use its
    // revision number against a different document.
    if (targetOp.docId?.toString() !== docId) {
      return res.status(400).json({ message: "Version does not belong to this document" });
    }

    // Reconstruct from the nearest snapshot AT OR BEFORE the target, then
    // replay forward. The old code always started from Document.snapshot — a
    // single field holding the most RECENT snapshot — so whenever the snapshot
    // was newer than the target (the common case) the replay range was empty
    // and the caller silently received the snapshot's content while the
    // endpoint reported "Document restored".
    //
    // contentAtRevision throws on an op that will not apply rather than
    // skipping it, so a corrupt log surfaces as a 500 instead of a quietly
    // wrong document.
    const doc = await Document.findById(docId).lean();
    if (!doc) return res.status(404).json({ message: "Document not found" });

    const restoredContent = await snapshotService.contentAtRevision(docId, targetOp.revision);

    const newRevision = doc.revision + 1;

    // Record the restore so the op log has no gap at this revision.
    await Operation.create({
      docId,
      userId: req.user.id,
      revision: newRevision,
      op: { type: "restore", toRevision: targetOp.revision, length: restoredContent.length },
    });

    await Document.findByIdAndUpdate(docId, {
      content: restoredContent,
      revision: newRevision,
    });
    await redisService.invalidateDocCache(docId);

    res.json({
      message: "Document restored",
      revision: newRevision,
      restoredFromRevision: targetOp.revision,
      content: restoredContent,
    });
  } catch (err) {
    next(err);
  }
};
