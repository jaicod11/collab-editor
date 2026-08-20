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

/**
 * Verify a user can read/write a document.
 * Owners and collaborators both have full access.
 * @returns {object} the document if access is granted
 * @throws  {Error}  with statusCode 403 or 404 if not
 */
async function assertAccess(docId, userId) {
    const doc = await Document.findById(docId).lean();
    if (!doc) {
        const err = new Error("Document not found");
        err.statusCode = 404;
        throw err;
    }

    const ownerId = doc.owner?.toString();
    const collabIds = (doc.collaborators ?? []).map((c) => c.toString());

    if (ownerId !== userId && !collabIds.includes(userId)) {
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
//     collaborators: [ { _id, name, email } ],
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
        collaborators: (doc.collaborators ?? []).map(person).filter(Boolean),
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
        .populate("collaborators", "name email")
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
        $or: [{ owner: userId }, { collaborators: userId }],
    };

    if (filter === "owned") query = { owner: userId };
    if (filter === "shared") query = { collaborators: userId, owner: { $ne: userId } };
    if (search.trim()) query.$text = { $search: search.trim() };

    const documents = await Document.find(query)
        .populate("owner", "name email")
        .populate("collaborators", "name email")
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
 * Add a userId to a document's collaborator list (idempotent).
 * Called by the socket handler when a new user joins a doc room.
 */
async function addCollaborator(docId, userId) {
    await Document.findByIdAndUpdate(
        docId,
        { $addToSet: { collaborators: userId } },
        { new: false }  // don't need the result
    );
    await redisService.invalidateDocCache(docId);
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
    assertAccess,
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