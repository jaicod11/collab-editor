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
const notificationService = require("../services/notificationService");
const Workspace = require("../models/Workspace");
const mongoose = require("mongoose");
const documentService = require("../services/documentService");

/**
 * ── The filing rule ──────────────────────────────────────────────────────────
 * A workspace is a PRIVATE organisational category, never a grant.
 *
 * Who may file: the document's OWNER, into one of their OWN workspaces.
 * Unfiling (null) is always allowed. Both halves are single-owner checks — the
 * document half structurally, because every write path here already filters on
 * `owner: req.user.id`, and the workspace half below.
 *
 * Why not collaborators: the workspace is the owner's private filing system. A
 * collaborator filing someone else's document would be sorting it into a
 * category its owner cannot even see.
 *
 * What it deliberately does NOT do: grant access. Filing gives nobody any
 * rights over a document — `list` applies the workspace filter IN ADDITION to
 * the owner/collaborator $or, so filtering can only ever narrow what the caller
 * could already see. A document shared with someone stays fully visible to them
 * under Shared with Me regardless of where its owner filed it, and the workspace
 * NAME never travels with the document: the client resolves names from
 * /api/workspaces, which returns only the caller's own, so a collaborator holds
 * an id they cannot resolve and renders nothing rather than a leaked name.
 *
 * @returns {Promise<boolean>} whether `userId` may file into `workspaceId`
 */
async function canFileInto(workspaceId, userId) {
  if (!mongoose.Types.ObjectId.isValid(workspaceId)) return false;
  const found = await Workspace.exists({ _id: workspaceId, owner: userId });
  return Boolean(found);
}

/**
 * Normalise an inbound `workspace` value to what should be stored.
 * @returns {{ ok: true, value: string|null } | { ok: false, message: string }}
 */
async function resolveWorkspace(raw, userId) {
  // null / "" / "none" / "unfiled" all mean "take it out of any workspace".
  if (raw === null || raw === "" || raw === "none" || raw === "unfiled") {
    return { ok: true, value: null };
  }
  if (!(await canFileInto(raw, userId))) {
    // One message for "no such workspace" and "not yours", so the endpoint
    // cannot be used to discover which workspace ids exist.
    return { ok: false, message: "Workspace not found or access denied" };
  }
  return { ok: true, value: raw };
}

// ── GET /api/documents ────────────────────────────────────────────────────────
exports.list = async (req, res, next) => {
  try {
    const userId = req.user.id;
    const { filter = "all", search = "", workspace, label } = req.query;

    let query = {
      $or: [{ owner: userId }, { "collaborators.user": userId }],
    };

    if (filter === "owned") query = { owner: userId };
    if (filter === "starred") query = { starredBy: userId };
    if (filter === "shared") query = { "collaborators.user": userId, owner: { $ne: userId } };

    // ── Status scoping ────────────────────────────────────────────────────
    // "all" / "owned" / "shared" only ever return Active documents — this is
    // what My Documents, Dashboard, and Shared with Me should show.
    // Archived and Trash (soft-deleted) docs are fetched via their own
    // dedicated filter values so they never leak into the normal views.
    if (filter === "starred") {
      // Starred spans everything the user can still open.
      query.status = "Active";
    } else if (filter === "archived") {
      query.status = "Archived";
    } else if (filter === "trash") {
      query.status = "Deleted";
    } else {
      query.status = "Active";
    }

    // ── Workspace scoping ─────────────────────────────────────────────────
    // Applied ON TOP of the access filter above, never instead of it, so a
    // workspace can only narrow what this user could already see. There is
    // deliberately no ownership check on the workspace id itself: it would add
    // a query and change nothing, because the access filter already bounds the
    // result to documents this user can see. Passing someone else's workspace
    // id simply matches none of them.
    if (workspace !== undefined && workspace !== "") {
      if (workspace === "unfiled" || workspace === "none" || workspace === "null") {
        query.workspace = null;
      } else if (mongoose.Types.ObjectId.isValid(workspace)) {
        query.workspace = new mongoose.Types.ObjectId(workspace);
      } else {
        // A malformed id would otherwise CastError into a 500.
        return res.status(400).json({ message: "Invalid workspace id" });
      }
    }

    if (search.trim()) {
      query.$text = { $search: search.trim() };
    }

    // ── Label filter ──────────────────────────────────────────────────────
    // Same rule as the workspace filter above: applied ON TOP of the access
    // scope, never instead of it, so it can only narrow what this caller could
    // already see. Labels are shared metadata, so unlike workspace there is
    // nothing private to leak — but a label is still not a way to reach a
    // document you have no access to.
    //
    // Normalised the same way writes are, so a filter typed as "Urgent"
    // matches a label stored as "urgent" rather than silently returning
    // nothing.
    if (label !== undefined && label !== "") {
      const [normalised] = Document.normaliseLabels([label]) ?? [];
      if (!normalised) {
        return res.status(400).json({ message: "Invalid label" });
      }
      query.labels = normalised;
    }

    const documents = await Document.find(query)
      .populate("owner", "name email")
      .populate("collaborators.user", "name email")
      .populate("statusChangedBy", "name email")
      .sort({ updatedAt: -1 })
      .limit(100)
      .lean();

    // Normalise to the same shape getOne serves, so the client sees one
    // collaborator representation everywhere (including the role).
    // `starred` is per-caller, so it is derived here rather than cached in the
    // shared canonical shape. starredBy itself is not returned: who else
    // starred a document is nobody's business.
    const shaped = documents.map((d) => {
      const canonical = documentService.toCanonical(d);
      const starred = (d.starredBy ?? []).some((u) => u.toString() === userId);
      delete canonical.starredBy;
      return { ...canonical, starred };
    });
    const recent = shaped.slice(0, 10);

    res.json({ documents: shaped, recent });
  } catch (err) {
    next(err);
  }
};

// ── POST /api/documents ───────────────────────────────────────────────────────
exports.create = async (req, res, next) => {
  try {
    const { title = "Untitled Document", content = "", workspace } = req.body;

    // The creator is the owner, so the filing rule reduces to "is this a
    // workspace you belong to". Omitting it creates an unfiled document, which
    // is a perfectly ordinary end state and not a gap to be filled later.
    let workspaceId = null;
    if (workspace !== undefined) {
      const resolved = await resolveWorkspace(workspace, req.user.id);
      if (!resolved.ok) return res.status(404).json({ message: resolved.message });
      workspaceId = resolved.value;
    }

    const doc = await Document.create({
      title,
      content,
      revision: 0,
      owner: req.user.id,
      workspace: workspaceId,
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

    const raw = await Document.findById(docId).select("starredBy").lean();
    res.json({ ...doc, starred: (raw?.starredBy ?? []).some((u) => u.toString() === userId) });
  } catch (err) {
    next(err);
  }
};

// ── PATCH /api/documents/:id ──────────────────────────────────────────────────
// Used for: rename (title), status changes (Active/Archived/Deleted restore-or-move)
exports.update = async (req, res, next) => {
  try {
    const { title, status, workspace } = req.body;
    const updates = {};
    if (title !== undefined) updates.title = title;

    // Owner-only comes free: the findOneAndUpdate below filters on
    // `owner: req.user.id`, so a collaborator's PATCH matches nothing and 404s.
    if (workspace !== undefined) {
      const resolved = await resolveWorkspace(workspace, req.user.id);
      if (!resolved.ok) return res.status(404).json({ message: resolved.message });
      updates.workspace = resolved.value;
    }
    if (status !== undefined) {
      if (!["Active", "Archived", "Deleted"].includes(status)) {
        return res.status(400).json({ message: "Invalid status value" });
      }
      updates.status = status;
      // Stamp the transition so Trash and Archive can report who binned a
      // document and when, instead of showing the owner and updatedAt.
      updates.statusChangedBy = req.user.id;
      updates.statusChangedAt = new Date();
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

// ── PUT /api/documents/:id/labels ─────────────────────────────────────────────
/**
 * Replace a document's labels.
 *
 * ── Who may label ────────────────────────────────────────────────────────────
 * The OWNER and EDITORS. A viewer gets 403.
 *
 * The case for letting viewers label is that labelling is personal
 * organisation, not content. That case does not hold here, because these labels
 * are SHARED: everyone with access sees the same set, so adding one changes
 * what other people see. That is an edit, and "cannot change what others see"
 * is the entire definition of the viewer role — letting a viewer through would
 * make the role's name false.
 *
 * The personal-organisation need is real, and it is already met: workspaces
 * (Phase 11) are private, per-user and invisible to collaborators. Making
 * labels per-user as well would be a second overlapping filing system with no
 * distinct job. So the split is deliberate — workspace is private, single and
 * owner-only; labels are shared, plural and editor-writable.
 *
 * Because nothing here is per-user, there is no cross-user leak to guard
 * against: every label on a document is visible to everyone who can open it,
 * by design.
 *
 * Enforcement reuses assertWriteAccess, the same helper op:submit uses, rather
 * than a second hand-rolled check — a viewer is refused by exactly the code
 * path that refuses their keystrokes.
 */
exports.setLabels = async (req, res, next) => {
  try {
    const docId = req.params.id;

    // Throws 403 (VIEWER_READONLY) for viewers, 403 for strangers, 404 for a
    // document that does not exist.
    await documentService.assertWriteAccess(docId, req.user.id);

    const labels = Document.normaliseLabels(req.body?.labels);
    if (labels === null) {
      return res.status(400).json({ message: "labels must be an array of strings" });
    }

    const doc = await Document.findByIdAndUpdate(
      docId,
      { labels },
      { new: true, runValidators: true }
    ).lean();

    if (!doc) return res.status(404).json({ message: "Document not found" });

    await redisService.invalidateDocCache(docId);

    // Returns the normalised set, not what was sent: the client must render
    // what was actually stored, or its chips disagree with the filter.
    res.json({ labels: doc.labels ?? [] });
  } catch (err) {
    next(err);
  }
};

// ── GET /api/documents/labels/in-use ──────────────────────────────────────────
/**
 * Every label in use across the documents this caller can see.
 *
 * Powers the filter menus. Derived from the documents themselves rather than a
 * separate collection of label definitions, which is what makes free-form
 * labels sustainable: nothing to keep in sync, no orphaned definitions when the
 * last document carrying a label loses it, and no rename/delete lifecycle.
 *
 * Scoped by the same access filter as list(), so it cannot be used to discover
 * which labels exist on documents the caller has no access to.
 */
exports.labelsInUse = async (req, res, next) => {
  try {
    const userId = req.user.id;
    const labels = await Document.distinct("labels", {
      $or: [{ owner: userId }, { "collaborators.user": userId }],
      status: "Active",
    });

    res.json({ labels: labels.filter(Boolean).sort() });
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
      { _id: docId, "collaborators.user": userId }, // must currently be a collaborator
      { $pull: { collaborators: { user: userId } } },
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

    // The document is gone for good, so every notification linking to it would
    // now lead nowhere. This is half of the notification retention policy — the
    // other half is the per-user cap in notificationService. There is no TTL.
    await notificationService.cascadeForDocument(req.params.id);

    res.json({ message: "Document deleted" });
  } catch (err) {
    next(err);
  }
};

// ── PUT /api/documents/:id/star ───────────────────────────────────────────────
// Anyone who can open the document may star it; a star is personal.
exports.star = async (req, res, next) => {
  try {
    const docId = req.params.id;
    await documentService.assertAccess(docId, req.user.id);
    await Document.findByIdAndUpdate(docId, { $addToSet: { starredBy: req.user.id } });
    await redisService.invalidateDocCache(docId);
    res.json({ starred: true });
  } catch (err) {
    next(err);
  }
};

// ── DELETE /api/documents/:id/star ────────────────────────────────────────────
exports.unstar = async (req, res, next) => {
  try {
    const docId = req.params.id;
    await documentService.assertAccess(docId, req.user.id);
    await Document.findByIdAndUpdate(docId, { $pull: { starredBy: req.user.id } });
    await redisService.invalidateDocCache(docId);
    res.json({ starred: false });
  } catch (err) {
    next(err);
  }
};
