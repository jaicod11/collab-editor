/**
 * controllers/documentController.js
 * ─────────────────────────────────────────────────────────────────────────────
 * GET    /api/documents          → list documents for current user
 * POST   /api/documents          → create new document
 * GET    /api/documents/:id      → get single document
 * PATCH  /api/documents/:id      → update title / status
 * DELETE /api/documents/:id      → delete document
 */

const Document        = require("../models/Document");
const redisService    = require("../services/redisService");

// ── GET /api/documents ────────────────────────────────────────────────────────
exports.list = async (req, res, next) => {
  try {
    const userId = req.user.id;
    const { filter = "all", search = "" } = req.query;

    let query = {
      $or: [{ owner: userId }, { collaborators: userId }],
    };

    if (filter === "owned")  query = { owner: userId };
    if (filter === "shared") query = { collaborators: userId };

    if (search.trim()) {
      query.$text = { $search: search.trim() };
    }

    const documents = await Document.find(query)
      .populate("owner", "name email")
      .populate("collaborators", "name email")
      .sort({ updatedAt: -1 })
      .limit(100)
      .lean();

    // Recent = last 10 edited by this user
    const recent = documents.slice(0, 10);

    res.json({ documents, recent });
  } catch (err) {
    next(err);
  }
};

// ── POST /api/documents ───────────────────────────────────────────────────────
exports.create = async (req, res, next) => {
  try {
    const { title = "Untitled Document" } = req.body;

    const doc = await Document.create({
      title,
      content:  "",
      revision: 0,
      owner:    req.user.id,
    });

    res.status(201).json(doc);
  } catch (err) {
    next(err);
  }
};

// ── GET /api/documents/:id ────────────────────────────────────────────────────
exports.getOne = async (req, res, next) => {
  try {
    const docId  = req.params.id;
    const userId = req.user.id;

    // Check Redis cache first
    let doc = await redisService.getDocCache(docId);
    if (!doc) {
      doc = await Document.findById(docId)
        .populate("owner", "name email")
        .populate("collaborators", "name email")
        .lean();
      if (!doc) return res.status(404).json({ message: "Document not found" });
      await redisService.setDocCache(docId, doc);
    }

    // Access check
    const isOwner = doc.owner?._id?.toString() === userId || doc.owner?.toString() === userId;
    const isCollab = (doc.collaborators ?? []).some(
      (c) => c._id?.toString() === userId || c.toString() === userId
    );
    if (!isOwner && !isCollab) {
      return res.status(403).json({ message: "Access denied" });
    }

    res.json(doc);
  } catch (err) {
    next(err);
  }
};

// ── PATCH /api/documents/:id ──────────────────────────────────────────────────
exports.update = async (req, res, next) => {
  try {
    const { title, status } = req.body;
    const updates = {};
    if (title  !== undefined) updates.title  = title;
    if (status !== undefined) updates.status = status;

    const doc = await Document.findOneAndUpdate(
      { _id: req.params.id, owner: req.user.id },
      updates,
      { new: true, runValidators: true }
    ).lean();

    if (!doc) return res.status(404).json({ message: "Document not found or access denied" });

    // Invalidate cache
    await redisService.invalidateDocCache(req.params.id);

    res.json(doc);
  } catch (err) {
    next(err);
  }
};

// ── DELETE /api/documents/:id ─────────────────────────────────────────────────
exports.remove = async (req, res, next) => {
  try {
    const doc = await Document.findOneAndDelete({
      _id:   req.params.id,
      owner: req.user.id,
    });

    if (!doc) return res.status(404).json({ message: "Document not found or access denied" });

    await redisService.invalidateDocCache(req.params.id);

    res.json({ message: "Document deleted" });
  } catch (err) {
    next(err);
  }
};
