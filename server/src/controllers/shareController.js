/**
 * server/src/controllers/shareController.js
 * ─────────────────────────────────────────────────────────────────────────────
 * Sharing, access requests, and collaborator management.
 *
 * ── The model ────────────────────────────────────────────────────────────────
 * A share token grants the ability to ASK for access, never access itself.
 * Following a link resolves to the document's title and owner name — nothing
 * else, not even the document id — and creates a pending request. Only the
 * owner approving turns that into a collaborator entry with a role.
 *
 * This is deliberately not "anyone with the link can edit": the previous
 * behaviour was that anyone who could reach a document and type was silently
 * added as a collaborator, which is the hole Phase 1 closed.
 *
 * ── Token vs collaborators ───────────────────────────────────────────────────
 * Revoking the share token stops NEW requests. It does not remove anyone who
 * has already been approved — those are separate concerns, and conflating them
 * would make "stop sharing this link" silently kick out the whole team. Removal
 * is DELETE /:id/collaborators/:userId, one person at a time and deliberate.
 */

const crypto = require("crypto");

const Document = require("../models/Document");
const AccessRequest = require("../models/AccessRequest");
const documentService = require("../services/documentService");
const redisService = require("../services/redisService");
const notificationService = require("../services/notificationService");
const Notification = require("../models/Notification");

const { ROLES } = Document;
const { STATUS } = AccessRequest;

/** 32 bytes of CSPRNG output, hex-encoded: 256 bits, not enumerable. */
function generateShareToken() {
  return crypto.randomBytes(32).toString("hex");
}

function shareLinkFor(token) {
  const base = (process.env.CLIENT_URL ?? "http://localhost:5173").replace(/\/+$/, "");
  return `${base}/join/${token}`;
}

// ── POST /api/documents/:id/share ─────────────────────────────────────  [owner]
exports.enableShare = async (req, res, next) => {
  try {
    const docId = req.params.id;
    await documentService.assertOwner(docId, req.user.id);

    // Lazily generated: a document that is never shared never carries a token.
    // Reuse an existing one so re-opening the dialog does not invalidate a link
    // the owner has already sent to someone.
    const existing = await Document.findById(docId).select("shareToken").lean();
    const token = existing?.shareToken ?? generateShareToken();

    await Document.findByIdAndUpdate(docId, { shareToken: token, shareEnabled: true });
    await redisService.invalidateDocCache(docId);

    res.json({ shareEnabled: true, shareToken: token, shareLink: shareLinkFor(token) });
  } catch (err) {
    next(err);
  }
};

// ── DELETE /api/documents/:id/share ───────────────────────────────────  [owner]
exports.revokeShare = async (req, res, next) => {
  try {
    const docId = req.params.id;
    await documentService.assertOwner(docId, req.user.id);

    // Clear the token outright rather than only flipping the flag, so a leaked
    // link is dead permanently and re-enabling issues a fresh one.
    await Document.findByIdAndUpdate(docId, { shareToken: null, shareEnabled: false });
    await redisService.invalidateDocCache(docId);

    // Pending requests made through the dead link are no longer actionable.
    await AccessRequest.deleteMany({ docId, status: STATUS.PENDING });

    res.json({
      shareEnabled: false,
      message: "Share link revoked. Existing collaborators keep their access.",
    });
  } catch (err) {
    next(err);
  }
};

// ── GET /api/documents/join/:token ────────────────────────────────────────────
// Resolves a token to the MINIMUM a person needs to decide whether to ask:
// the title and who owns it. Never content. The document id is returned only
// when the caller already has access, because it is what lets them navigate
// straight into the editor — for everyone else it stays hidden so the token
// cannot be traded for an id usable against other endpoints.
exports.resolveToken = async (req, res, next) => {
  try {
    const doc = await Document.findOne({
      shareToken: req.params.token,
      shareEnabled: true,
    })
      .populate("owner", "name")
      .lean();

    if (!doc) {
      return res.status(404).json({ message: "This share link is no longer valid" });
    }

    const role = documentService.roleOf(doc, req.user.id);
    if (role) {
      return res.json({
        state: "has-access",
        title: doc.title,
        ownerName: doc.owner?.name ?? "Unknown",
        role,
        docId: doc._id, // only now: they can already open it
      });
    }

    const existing = await AccessRequest.findOne({ docId: doc._id, userId: req.user.id }).lean();

    res.json({
      state: existing?.status === STATUS.PENDING ? "pending" : "no-access",
      title: doc.title,
      ownerName: doc.owner?.name ?? "Unknown",
      requestedRole: existing?.requestedRole ?? null,
      // No docId, no content, no collaborator list, no owner email.
    });
  } catch (err) {
    next(err);
  }
};

// ── POST /api/documents/join/:token ───────────────────────────────────────────
exports.requestAccess = async (req, res, next) => {
  try {
    const requestedRole = req.body?.requestedRole === ROLES.VIEWER ? ROLES.VIEWER : ROLES.EDITOR;

    const doc = await Document.findOne({
      shareToken: req.params.token,
      shareEnabled: true,
    }).lean();

    if (!doc) {
      return res.status(404).json({ message: "This share link is no longer valid" });
    }

    if (documentService.roleOf(doc, req.user.id)) {
      return res.json({ state: "has-access", docId: doc._id });
    }

    // Upsert against the unique (docId, userId) index: following the link twice
    // updates the existing row instead of queueing a second request.
    await AccessRequest.findOneAndUpdate(
      { docId: doc._id, userId: req.user.id },
      {
        $set: { requestedRole, status: STATUS.PENDING, decidedBy: null, decidedAt: null },
        $setOnInsert: { docId: doc._id, userId: req.user.id },
      },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    );

    // The owner's only other signal that someone is waiting is opening the
    // Share modal and looking. Notify them instead.
    await notificationService.create(
      {
        userId: doc.owner.toString(),
        type: Notification.TYPES.ACCESS_REQUESTED,
        docId: doc._id.toString(),
        docTitle: doc.title,
        actorName: req.user.name,
        role: requestedRole,
      },
      req.app.get("notifyUser")
    );

    res.status(201).json({ state: "pending", requestedRole });
  } catch (err) {
    // Concurrent first-requests can race the unique index; that is success.
    if (err.code === 11000) return res.status(201).json({ state: "pending" });
    next(err);
  }
};

// ── GET /api/documents/:id/requests ───────────────────────────────────  [owner]
exports.listRequests = async (req, res, next) => {
  try {
    const docId = req.params.id;
    await documentService.assertOwner(docId, req.user.id);

    const requests = await AccessRequest.find({ docId, status: STATUS.PENDING })
      .populate("userId", "name email")
      .sort({ createdAt: -1 })
      .lean();

    res.json({
      requests: requests.map((r) => ({
        id: r._id,
        userId: r.userId?._id,
        name: r.userId?.name ?? "Unknown",
        email: r.userId?.email ?? null,
        requestedRole: r.requestedRole,
        createdAt: r.createdAt,
      })),
    });
  } catch (err) {
    next(err);
  }
};

// ── POST /api/documents/:id/requests/:reqId/approve ───────────────────  [owner]
exports.approveRequest = async (req, res, next) => {
  try {
    const { id: docId, reqId } = req.params;
    await documentService.assertOwner(docId, req.user.id);

    const request = await AccessRequest.findById(reqId);
    if (!request || request.docId.toString() !== docId) {
      return res.status(404).json({ message: "Request not found" });
    }
    if (request.status !== STATUS.PENDING) {
      return res.status(409).json({ message: "This request has already been decided" });
    }

    const role = req.body?.role === ROLES.VIEWER ? ROLES.VIEWER : ROLES.EDITOR;
    await documentService.addCollaborator(docId, request.userId.toString(), role);

    request.status = STATUS.APPROVED;
    request.decidedBy = req.user.id;
    request.decidedAt = new Date();
    await request.save();

    const doc = await Document.findById(docId).select("title").lean();

    // Push the requester into the document without a refresh.
    req.app.get("notifyUser")?.(request.userId.toString(), "access:granted", {
      docId,
      title: doc?.title ?? "Untitled Document",
      role,
    });

    // Approval is also the ONLY path that adds a collaborator — there is no
    // direct add-collaborator endpoint — so "you were added as a collaborator"
    // and "your request was approved" are the same moment, and get one row
    // rather than two saying the same thing.
    await notificationService.create(
      {
        userId: request.userId.toString(),
        type: Notification.TYPES.ACCESS_APPROVED,
        docId,
        docTitle: doc?.title ?? "Untitled Document",
        actorName: req.user.name,
        role,
      },
      req.app.get("notifyUser")
    );

    res.json({ approved: true, userId: request.userId, role });
  } catch (err) {
    next(err);
  }
};

// ── POST /api/documents/:id/requests/:reqId/deny ──────────────────────  [owner]
exports.denyRequest = async (req, res, next) => {
  try {
    const { id: docId, reqId } = req.params;
    await documentService.assertOwner(docId, req.user.id);

    const request = await AccessRequest.findById(reqId);
    if (!request || request.docId.toString() !== docId) {
      return res.status(404).json({ message: "Request not found" });
    }

    request.status = STATUS.DENIED;
    request.decidedBy = req.user.id;
    request.decidedAt = new Date();
    await request.save();

    req.app.get("notifyUser")?.(request.userId.toString(), "access:denied", { docId });

    const deniedDoc = await Document.findById(docId).select("title").lean();
    await notificationService.create(
      {
        userId: request.userId.toString(),
        type: Notification.TYPES.ACCESS_DENIED,
        docId,
        docTitle: deniedDoc?.title ?? "Untitled Document",
        actorName: req.user.name,
      },
      req.app.get("notifyUser")
    );

    res.json({ denied: true });
  } catch (err) {
    next(err);
  }
};

// ── PATCH /api/documents/:id/collaborators/:userId ────────────────────  [owner]
exports.setCollaboratorRole = async (req, res, next) => {
  try {
    const { id: docId, userId } = req.params;
    await documentService.assertOwner(docId, req.user.id);

    const role = req.body?.role;
    if (![ROLES.EDITOR, ROLES.VIEWER].includes(role)) {
      return res.status(400).json({ message: "Role must be editor or viewer" });
    }

    const doc = await Document.findById(docId).lean();

    // The owner is not a collaborator and has no assignable role. Without this
    // guard, roleOf() returned "owner" (truthy), the check passed, and
    // addCollaborator PUSHED the owner into their own collaborator list — so
    // the document ended up with an owner who was also listed as a viewer, and
    // the Share modal rendered them twice.
    if (documentService.roleOf(doc, userId) === ROLES.OWNER) {
      return res.status(400).json({ message: "The owner's role cannot be changed" });
    }

    if (!documentService.roleOf(doc, userId)) {
      return res.status(404).json({ message: "Not a collaborator on this document" });
    }

    await documentService.addCollaborator(docId, userId, role);

    // Both directions must bite immediately, not at the next reconnect:
    // documentHandler memoises the role per socket. `disconnect: false` keeps
    // them in the room; `role` tells them which way it went.
    req.app.get("changeDocumentAccess")?.(docId, userId, { disconnect: false, role });

    await notificationService.create(
      {
        userId,
        type: Notification.TYPES.ROLE_CHANGED,
        docId,
        docTitle: doc?.title ?? "Untitled Document",
        actorName: req.user.name,
        role,
      },
      req.app.get("notifyUser")
    );

    res.json({ userId, role });
  } catch (err) {
    next(err);
  }
};

// ── DELETE /api/documents/:id/collaborators/:userId ───────────────────  [owner]
exports.removeCollaborator = async (req, res, next) => {
  try {
    const { id: docId, userId } = req.params;
    await documentService.assertOwner(docId, req.user.id);

    // Guarded explicitly rather than relying on the owner simply not being in
    // the collaborators array: an owner who had been wrongly pushed into it
    // (see setCollaboratorRole) could otherwise remove themselves.
    const doc = await Document.findById(docId).lean();
    if (documentService.roleOf(doc, userId) === ROLES.OWNER) {
      return res.status(400).json({ message: "The owner cannot be removed from their own document" });
    }

    const removed = await documentService.removeCollaborator(docId, userId);
    if (!removed) {
      return res.status(404).json({ message: "Not a collaborator on this document" });
    }

    // Drop any decided request so the person can be re-invited later.
    await AccessRequest.deleteOne({ docId, userId });

    // Force them out of the room and invalidate the cached grant their open
    // socket is holding.
    req.app.get("changeDocumentAccess")?.(docId, userId, { disconnect: true });

    // Deliberately keeps the docId: the row is a record of what happened, and
    // the client renders a revocation as unlinked text rather than a link into
    // a document the user can no longer open.
    await notificationService.create(
      {
        userId,
        type: Notification.TYPES.ACCESS_REVOKED,
        docId,
        docTitle: doc?.title ?? "Untitled Document",
        actorName: req.user.name,
      },
      req.app.get("notifyUser")
    );

    res.json({ removed: true, userId });
  } catch (err) {
    next(err);
  }
};

// ── GET /api/documents/:id/collaborators ──────────────────────────────────────
// Readable by anyone with access; the token is owner-only and is NOT included.
exports.listCollaborators = async (req, res, next) => {
  try {
    const docId = req.params.id;
    const { doc, role } = await documentService.assertAccess(docId, req.user.id);

    const populated = await Document.findById(docId)
      .populate("owner", "name email")
      .populate("collaborators.user", "name email")
      .lean();

    const payload = {
      owner: {
        _id: populated.owner?._id,
        name: populated.owner?.name,
        email: populated.owner?.email,
      },
      collaborators: (populated.collaborators ?? []).map((c) => ({
        _id: c.user?._id,
        name: c.user?.name ?? "Unknown",
        email: c.user?.email ?? null,
        role: c.role ?? ROLES.EDITOR,
      })),
      viewerRole: role,
      shareEnabled: Boolean(doc.shareEnabled),
    };

    // Owner-only fields.
    if (role === ROLES.OWNER && doc.shareEnabled && doc.shareToken) {
      payload.shareToken = doc.shareToken;
      payload.shareLink = shareLinkFor(doc.shareToken);
    }

    res.json(payload);
  } catch (err) {
    next(err);
  }
};

exports._generateShareToken = generateShareToken;
