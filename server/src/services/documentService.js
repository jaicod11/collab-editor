/**
 * server/src/services/documentService.js
 * ─────────────────────────────────────────────────────────────────────────────
 * Business logic layer for document operations.
 * Controllers and socket handlers call this — they never touch models directly.
 *
 * Centralises:
 *   - Access control checks
 *   - Cache invalidation coordination
 *   - Collaborator management
 *   - Document creation defaults
 */

const Document = require("../models/Document");
const Operation = require("../models/Operation");
const redisService = require("./redisService");

// ─── Access control ───────────────────────────────────────────────────────────

const { ROLES, WRITE_ROLES } = Document;

/** The caller's role on a document, or null when they have none. */
function roleOf(doc, userId) {
    if (!doc || !userId) return null;
    if ((doc.owner?._id ?? doc.owner)?.toString() === userId) return ROLES.OWNER;
    const entry = (doc.collaborators ?? []).find(
        (c) => (c.user?._id ?? c.user)?.toString() === userId
    );
    return entry ? (entry.role ?? ROLES.EDITOR) : null;
}

/** True when `role` may change document content. */
function canWrite(role) {
    return WRITE_ROLES.includes(role);
}

/**
 * Verify a user can READ a document, and report what they may do.
 *
 * Returns the role rather than just the document so callers can distinguish
 * read from write access — a viewer passes this check but must not be allowed
 * to submit ops. Callers that mutate content must test the returned role.
 *
 * @returns {Promise<{ doc: object, role: "owner"|"editor"|"viewer" }>}
 * @throws  {Error} statusCode 404 when missing, 403 when the user has no role
 */
async function assertAccess(docId, userId) {
    const doc = await Document.findById(docId).lean();
    if (!doc) {
        const err = new Error("Document not found");
        err.statusCode = 404;
        throw err;
    }

    const role = roleOf(doc, userId);
    if (!role) {
        const err = new Error("Access denied");
        err.statusCode = 403;
        throw err;
    }

    return { doc, role };
}

/**
 * Verify the caller may modify document CONTENT.
 * @throws {Error} statusCode 403 for viewers, with code VIEWER_READONLY
 */
async function assertWriteAccess(docId, userId) {
    const { doc, role } = await assertAccess(docId, userId);
    if (!canWrite(role)) {
        const err = new Error("Read-only access");
        err.statusCode = 403;
        err.code = "VIEWER_READONLY";
        throw err;
    }
    return { doc, role };
}

/**
 * Verify the caller OWNS the document. Used by every share/collaborator
 * management endpoint — an existing collaborator, of any role, is not enough.
 * @throws {Error} statusCode 404 when missing, 403 when not the owner
 */
async function assertOwner(docId, userId) {
    const doc = await Document.findById(docId).lean();
    if (!doc) {
        const err = new Error("Document not found");
        err.statusCode = 404;
        throw err;
    }
    if (roleOf(doc, userId) !== ROLES.OWNER) {
        // Deliberately the same message a non-collaborator gets: whether a
        // document exists and who owns it is not something a collaborator
        // needs confirmed by probing owner-only routes.
        const err = new Error("Access denied");
        err.statusCode = 403;
        throw err;
    }
    return doc;
}

// ─── Canonical cached document shape ─────────────────────────────────────────
//
// EVERY writer of `doc:cache:{docId}` must produce exactly this shape:
//
//   {
//     _id:           string,
//     title:         string,
//     content:       string,
//     revision:      number,
//     status:        "Active" | "Archived" | "Deleted",
//     owner:         { _id, name, email },
//     collaborators: [ { _id, name, email, role } ],
//     createdAt, updatedAt
//   }
//
// Before this existed there were two shapes under the same key. The socket
// handler cached `Document.findById().lean()` (raw ObjectIds) while the REST
// controller cached the populated version ({name,email} objects); whichever ran
// first won. Two things broke as a result:
//   - getOne read a socket-written entry, found `owner._id` undefined, and
//     returned 403 to the document's own owner;
//   - the client's ownerName() helper rendered a raw ObjectId as a person's
//     name, because `typeof o === "object"` was false for a plain id string.
//
// A restore path made it worse by caching only { content, revision }, dropping
// owner and collaborators entirely.
//
// Use loadCanonical() to read and toCanonical() to normalise. Do not call
// redisService.setDocCache() with anything else.

/** Normalise a Mongo document (populated or not) into the canonical shape. */
function toCanonical(doc) {
    if (!doc) return null;

    const person = (value) => {
        if (!value) return null;
        // Populated: a subdocument. Unpopulated: an ObjectId or its string form.
        if (typeof value === "object" && (value.name !== undefined || value.email !== undefined)) {
            return {
                _id: value._id?.toString() ?? String(value._id ?? ""),
                name: value.name ?? null,
                email: value.email ?? null,
            };
        }
        return { _id: value.toString(), name: null, email: null };
    };

    return {
        _id: doc._id?.toString() ?? String(doc._id ?? ""),
        title: doc.title ?? "Untitled Document",
        content: doc.content ?? "",
        revision: doc.revision ?? 0,
        status: doc.status ?? "Active",
        owner: person(doc.owner),
        collaborators: (doc.collaborators ?? [])
            .map((c) => {
                const who = person(c.user ?? c);
                return who ? { ...who, role: c.role ?? "editor" } : null;
            })
            .filter(Boolean),
        // Never cache the share token: the cached document is served to every
        // collaborator by getOne, and the token is owner-only.
        shareEnabled: Boolean(doc.shareEnabled),
        // The id only, never a populated name. The client resolves names from
        // /api/workspaces, which is already scoped to workspaces the caller
        // owns or belongs to — so a collaborator who is not a member of the
        // owner's workspace gets an id they cannot resolve, and renders
        // nothing, rather than being shown the workspace's name.
        workspace: doc.workspace ? doc.workspace.toString() : null,

        // Shared metadata, unlike workspace above: every collaborator sees the
        // same labels, so this travels with the document for everyone.
        labels: Array.isArray(doc.labels) ? doc.labels : [],
        statusChangedBy: doc.statusChangedBy ? person(doc.statusChangedBy) : null,
        statusChangedAt: doc.statusChangedAt ?? null,
        createdAt: doc.createdAt ?? null,
        updatedAt: doc.updatedAt ?? null,
    };
}

/**
 * Read a document in the canonical shape, using the cache when it is warm.
 * Populates on a miss so the cached entry always carries owner/collaborator
 * names — the shape the REST layer and the client both expect.
 *
 * Performs NO access check: callers do that (assertAccess, or the socket
 * handler's ensureAccess).
 *
 * @returns {Promise<object|null>} canonical document, or null if missing
 */
async function loadCanonical(docId) {
    const cached = await redisService.getDocCache(docId);
    if (cached) return cached;

    const doc = await Document.findById(docId)
        .populate("owner", "name email")
        .populate("collaborators.user", "name email")
        .populate("statusChangedBy", "name email")
        .lean();
    if (!doc) return null;

    const canonical = toCanonical(doc);
    await redisService.setDocCache(docId, canonical);
    return canonical;
}

// ─── CRUD ─────────────────────────────────────────────────────────────────────

/**
 * Create a new document owned by userId.
 */
async function createDocument(userId, { title = "Untitled Document" } = {}) {
    const doc = await Document.create({
        title,
        content: "",
        revision: 0,
        owner: userId,
        status: "Active",
    });
    return doc;
}

/**
 * Get a single document by ID, with cache.
 * Throws 404 if not found, 403 if user has no access.
 */
async function getDocument(docId, userId) {
    // Reads through loadCanonical so this cannot write a second cached shape —
    // it previously cached its own populated form under the same key the socket
    // handler wrote a raw form to.
    const doc = await loadCanonical(docId);
    if (!doc) {
        const err = new Error("Document not found");
        err.statusCode = 404;
        throw err;
    }

    const collabIds = (doc.collaborators ?? []).map((c) => c._id);
    if (userId && doc.owner?._id !== userId && !collabIds.includes(userId)) {
        const err = new Error("Access denied");
        err.statusCode = 403;
        throw err;
    }

    return doc;
}

/**
 * List all documents accessible to a user.
 */
async function listDocuments(userId, { filter = "all", search = "" } = {}) {
    let query = {
        $or: [{ owner: userId }, { "collaborators.user": userId }],
    };

    if (filter === "owned") query = { owner: userId };
    if (filter === "shared") query = { "collaborators.user": userId, owner: { $ne: userId } };
    if (search.trim()) query.$text = { $search: search.trim() };

    const documents = await Document.find(query)
        .populate("owner", "name email")
        .populate("collaborators.user", "name email")
        .sort({ updatedAt: -1 })
        .limit(100)
        .lean();

    const recent = documents.slice(0, 10);
    return { documents, recent };
}

/**
 * Update document metadata (title, status).
 * Only the owner may update.
 */
async function updateDocument(docId, userId, patch) {
    const allowed = {};
    if (patch.title !== undefined) allowed.title = patch.title;
    if (patch.status !== undefined) allowed.status = patch.status;

    const doc = await Document.findOneAndUpdate(
        { _id: docId, owner: userId },
        allowed,
        { new: true, runValidators: true }
    ).lean();

    if (!doc) {
        const err = new Error("Document not found or access denied");
        err.statusCode = 404;
        throw err;
    }

    await redisService.invalidateDocCache(docId);
    return doc;
}

/**
 * Soft-delete by archiving, or hard-delete.
 * Only the owner may delete.
 */
async function deleteDocument(docId, userId) {
    const doc = await Document.findOneAndDelete({ _id: docId, owner: userId });
    if (!doc) {
        const err = new Error("Document not found or access denied");
        err.statusCode = 404;
        throw err;
    }
    await redisService.invalidateDocCache(docId);
    return doc;
}

// ─── Collaborator management ──────────────────────────────────────────────────

/**
 * Add a user to a document's collaborator list with an explicit role, or update
 * the role if they are already on it. Idempotent.
 *
 * Called only from the approval endpoint. It is deliberately NOT reachable from
 * the editing path: op:submit used to $addToSet the editor, which silently
 * enrolled anyone who could reach a document.
 */
async function addCollaborator(docId, userId, role = ROLES.EDITOR) {
    if (![ROLES.EDITOR, ROLES.VIEWER].includes(role)) {
        const err = new Error("Invalid role");
        err.statusCode = 400;
        throw err;
    }

    // Try to update an existing entry first; insert only if there was none.
    const updated = await Document.findOneAndUpdate(
        { _id: docId, "collaborators.user": userId },
        { $set: { "collaborators.$.role": role } },
        { new: true }
    );

    if (!updated) {
        await Document.findByIdAndUpdate(docId, {
            $push: { collaborators: { user: userId, role, addedAt: new Date() } },
        });
    }

    await redisService.invalidateDocCache(docId);
    return role;
}

/**
 * Remove a collaborator entirely.
 * @returns {Promise<boolean>} true if an entry was actually removed
 */
async function removeCollaborator(docId, userId) {
    const result = await Document.findOneAndUpdate(
        { _id: docId, "collaborators.user": userId },
        { $pull: { collaborators: { user: userId } } },
        { new: true }
    );
    await redisService.invalidateDocCache(docId);
    return Boolean(result);
}

// ─── Content helpers ──────────────────────────────────────────────────────────

/**
 * Atomically update content + revision after a successful OT apply.
 * Uses findByIdAndUpdate so this is safe under concurrent writes
 * (the Redis lock in documentHandler is the real guard; this is the persist step).
 */
function saveContent(docId, content, revision) {
    return Document.findByIdAndUpdate(
        docId,
        { content, revision },
        { new: true, select: "content revision" }
    ).lean();
}

/**
 * Get just the op log for a document between two revisions.
 * Used by historyController and documentHandler catch-up.
 */
function getOpsBetween(docId, fromRevision, toRevision) {
    return Operation.find({
        docId,
        revision: { $gt: fromRevision, $lte: toRevision },
    })
        .sort({ revision: 1 })
        .lean();
}

module.exports = {
    ROLES,
    roleOf,
    canWrite,
    assertAccess,
    assertWriteAccess,
    assertOwner,
    removeCollaborator,
    toCanonical,
    loadCanonical,
    createDocument,
    getDocument,
    listDocuments,
    updateDocument,
    deleteDocument,
    addCollaborator,
    saveContent,
    getOpsBetween,
};