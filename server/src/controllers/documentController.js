/**
 * server/src/controllers/documentController.js — updated
 * ─────────────────────────────────────────────────────────────────────────────
 * Two fixes delivered here that were previously only described in chat text:
 *
 * 1. `list()` now scopes every query by status:
 *      filter=all/owned/shared (default) → status: "Active" only
 *      filter=archived                    → status: "Archived"
 *      filter=trash                       → status: "Deleted"
 *    Before this fix, Archived/Deleted documents were leaking into
 *    My Documents and the Dashboard because status was never filtered.
 *
 * 2. New `leave()` endpoint — PATCH /api/documents/:id/leave
 *    Removes the current user from a document's collaborators list.
 *    This is what SharedWithMePage.jsx's "Remove me" menu item calls.
 *    It was referenced in the frontend but never actually implemented
 *    on the backend until now.
 */

const Document = require("../models/Document");
const redisService = require("../services/redisService");
const documentService = require("../services/documentService");

// ── GET /api/documents ────────────────────────────────────────────────────────
exports.list = async (req, res, next) => {
  try {
    const userId = req.user.id;
    const { filter = "all", search = "" } = req.query;

    let query = {
      $or: [{ owner: userId }, { collaborators: userId }],
    };

    if (filter === "owned") query = { owner: userId };
    if (filter === "shared") query = { collaborators: userId, owner: { $ne: userId } };

    // ── Status scoping ────────────────────────────────────────────────────
    // "all" / "owned" / "shared" only ever return Active documents — this is
    // what My Documents, Dashboard, and Shared with Me should show.
    // Archived and Trash (soft-deleted) docs are fetched via their own
    // dedicated filter values so they never leak into the normal views.
    if (filter === "archived") {
      query.status = "Archived";
    } else if (filter === "trash") {
      query.status = "Deleted";
    } else {
      query.status = "Active";
    }

    if (search.trim()) {
      query.$text = { $search: search.trim() };
    }

    const documents = await Document.find(query)
      .populate("owner", "name email")
      .populate("collaborators", "name email")
      .sort({ updatedAt: -1 })
      .limit(100)
      .lean();

    const recent = documents.slice(0, 10);

    res.json({ documents, recent });
  } catch (err) {
    next(err);
  }
};

// ── POST /api/documents ───────────────────────────────────────────────────────
exports.create = async (req, res, next) => {
  try {
    const { title = "Untitled Document", content = "" } = req.body;

    const doc = await Document.create({
      title,
      content,
      revision: 0,
      owner: req.user.id,
      status: "Active",
    });

    res.status(201).json(doc);
  } catch (err) {
    next(err);
  }
};

// ── GET /api/documents/:id ────────────────────────────────────────────────────
exports.getOne = async (req, res, next) => {
  try {
    const docId = req.params.id;
    const userId = req.user.id;

    // Canonical loader — the single cached shape shared with the socket layer.
    // This used to read and write doc:cache:{id} with its own populated shape
    // while documentHandler wrote a raw one under the same key; whichever ran
    // first won, and reading the other's entry made owner._id undefined and
    // 403'd the document's own owner. See documentService.toCanonical().
    const doc = await documentService.loadCanonical(docId);
    if (!doc) return res.status(404).json({ message: "Document not found" });

    const isOwner = doc.owner?._id === userId;
    const isCollab = (doc.collaborators ?? []).some((c) => c._id === userId);
    if (!isOwner && !isCollab) {
      return res.status(403).json({ message: "Access denied" });
    }

    res.json(doc);
  } catch (err) {
    next(err);
  }
};

// ── PATCH /api/documents/:id ──────────────────────────────────────────────────
// Used for: rename (title), status changes (Active/Archived/Deleted restore-or-move)
exports.update = async (req, res, next) => {
  try {
    const { title, status } = req.body;
    const updates = {};
    if (title !== undefined) updates.title = title;
    if (status !== undefined) {
      if (!["Active", "Archived", "Deleted"].includes(status)) {
        return res.status(400).json({ message: "Invalid status value" });
      }
      updates.status = status;
    }

    const doc = await Document.findOneAndUpdate(
      { _id: req.params.id, owner: req.user.id },
      updates,
      { new: true, runValidators: true }
    ).lean();

    if (!doc) return res.status(404).json({ message: "Document not found or access denied" });

    await redisService.invalidateDocCache(req.params.id);

    res.json(doc);
  } catch (err) {
    next(err);
  }
};

// ── PATCH /api/documents/:id/leave ────────────────────────────────────────────
// Removes the CURRENT USER from a document's collaborator list.
// Used by the "Remove me" action on Shared with Me — a collaborator can
// remove themselves from a doc they don't own, without needing owner rights.
exports.leave = async (req, res, next) => {
  try {
    const docId = req.params.id;
    const userId = req.user.id;

    const doc = await Document.findOneAndUpdate(
      { _id: docId, collaborators: userId }, // must currently be a collaborator
      { $pull: { collaborators: userId } },
      { new: true }
    );

    if (!doc) {
      return res.status(404).json({ message: "Document not found or you are not a collaborator" });
    }

    await redisService.invalidateDocCache(docId);

    res.json({ message: "Removed from document" });
  } catch (err) {
    next(err);
  }
};

// ── DELETE /api/documents/:id ─────────────────────────────────────────────────
// Permanent, irreversible delete. Only ever called from the Trash page's
// "Delete permanently" action — never from "Move to Trash" (that's a PATCH
// to status:"Deleted" instead, see update() above).
exports.remove = async (req, res, next) => {
  try {
    const doc = await Document.findOneAndDelete({
      _id: req.params.id,
      owner: req.user.id,
    });

    if (!doc) return res.status(404).json({ message: "Document not found or access denied" });

    await redisService.invalidateDocCache(req.params.id);

    res.json({ message: "Document deleted" });
  } catch (err) {
    next(err);
  }
};