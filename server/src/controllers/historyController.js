/**
 * controllers/historyController.js
 * ─────────────────────────────────────────────────────────────────────────────
 * GET  /api/documents/:id/history        → paginated op log (version history)
 * POST /api/documents/:id/restore/:revId → restore a specific version
 */

const Operation = require("../models/Operation");
const Document = require("../models/Document");
const otService = require("../services/otService");
const redisService = require("../services/redisService");
const documentService = require("../services/documentService");

// ── GET /api/documents/:id/history ───────────────────────────────────────────
exports.getHistory = async (req, res, next) => {
  try {
    const { id: docId } = req.params;
    const { limit = 20, before } = req.query; // `before` = revision cursor for pagination

    // The op log embeds the literal text of every edit — owner/collaborator only.
    await documentService.assertAccess(docId, req.user.id);

    const query = { docId };
    if (before) query.revision = { $lt: Number(before) };

    const ops = await Operation.find(query)
      .populate("userId", "name email")
      .sort({ revision: -1 })
      .limit(Number(limit))
      .lean();

    // Shape into version history entries
    const history = ops.map((op) => ({
      id: op._id,
      revision: op.revision,
      author: {
        id: op.userId?._id,
        name: op.userId?.name ?? "Unknown",
        initials: (op.userId?.name ?? "?").split(" ").map((n) => n[0]).join("").toUpperCase().slice(0, 2),
      },
      opType: op.op?.type,
      description: describeOp(op.op),
      appliedAt: op.appliedAt,
      snapshotId: op._id,
    }));

    res.json({ history, hasMore: ops.length === Number(limit) });
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

    // Find nearest snapshot before the target revision
    const doc = await Document.findById(docId).lean();
    if (!doc) return res.status(404).json({ message: "Document not found" });

    const baseContent = doc.snapshot?.content ?? "";
    const baseRevision = doc.snapshot?.revision ?? 0;

    // Replay ops from snapshot to target revision
    const ops = await Operation.find({
      docId,
      revision: { $gt: baseRevision, $lte: targetOp.revision },
    }).sort({ revision: 1 }).lean();

    let restoredContent = baseContent;
    for (const op of ops) {
      try {
        restoredContent = otService.applyOp(restoredContent, op.op);
      } catch {
        // If a single op fails, skip it (corrupted op log edge case)
      }
    }

    const newRevision = doc.revision + 1;
    await Document.findByIdAndUpdate(docId, {
      content: restoredContent,
      revision: newRevision,
    });
    await redisService.invalidateDocCache(docId);

    res.json({
      message: "Document restored",
      revision: newRevision,
      content: restoredContent,
    });
  } catch (err) {
    next(err);
  }
};

// ─── Helper ────────────────────────────────────────────────────────────────────
function describeOp(op) {
  if (!op) return "Unknown change";

  if (op.type === "insert") {
    const preview = op.text?.slice(0, 40) ?? "";
    return `Inserted "${preview}${op.text?.length > 40 ? "…" : ""}"`;
  }

  if (op.type === "delete") {
    // Zero-length deletes are no longer produced by the transform, and are
    // never persisted, but guard anyway so a legacy row cannot render as
    // "Deleted 0 characters".
    if (!(op.len > 0)) return "No change";
    return `Deleted ${op.len} character${op.len === 1 ? "" : "s"}`;
  }

  if (op.type === "batch") {
    // A delete split around a concurrent insert.
    const total = (op.ops ?? [])
      .filter((o) => o?.type === "delete" && o.len > 0)
      .reduce((sum, o) => sum + o.len, 0);
    if (total > 0) return `Deleted ${total} character${total === 1 ? "" : "s"}`;
    return "Document modified";
  }

  if (op.type === "noop") return "No change";

  return "Document modified";
}
