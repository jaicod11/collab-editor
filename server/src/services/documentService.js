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
    // Try Redis cache first
    let doc = await redisService.getDocCache(docId);
    if (!doc) {
        doc = await Document
            .findById(docId)
            .populate("owner", "name email")
            .populate("collaborators", "name email")
            .lean();
        if (!doc) {
            const err = new Error("Document not found");
            err.statusCode = 404;
            throw err;
        }
        await redisService.setDocCache(docId, doc);
    }

    // Access check
    const ownerId = doc.owner?._id?.toString() ?? doc.owner?.toString();
    const collabIds = (doc.collaborators ?? []).map((c) => c._id?.toString() ?? c.toString());

    if (userId && ownerId !== userId && !collabIds.includes(userId)) {
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
async function saveContent(docId, content, revision) {
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
async function getOpsBetween(docId, fromRevision, toRevision) {
    return Operation.find({
        docId,
        revision: { $gt: fromRevision, $lte: toRevision },
    })
        .sort({ revision: 1 })
        .lean();
}

module.exports = {
    assertAccess,
    createDocument,
    getDocument,
    listDocuments,
    updateDocument,
    deleteDocument,
    addCollaborator,
    saveContent,
    getOpsBetween,
};