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

// ── GET /api/documents/:id/history ───────────────────────────────────────────
exports.getHistory = async (req, res, next) => {
  try {
    const { id: docId } = req.params;
    const { limit = 20, before } = req.query; // `before` = revision cursor for pagination

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

    const targetOp = await Operation.findById(revId).lean();
    if (!targetOp) return res.status(404).json({ message: "Version not found" });

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
    return `Deleted ${op.len} character${op.len === 1 ? "" : "s"}`;
  }
  return "Document modified";
}
