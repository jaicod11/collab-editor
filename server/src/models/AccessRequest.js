/**
 * server/src/models/AccessRequest.js
 * ─────────────────────────────────────────────────────────────────────────────
 * A request from a signed-in user to be added to a document, created by
 * following a share link. Holding a share token lets you ASK; only the owner
 * approving turns that into access.
 */

const mongoose = require("mongoose");

const STATUS = Object.freeze({ PENDING: "pending", APPROVED: "approved", DENIED: "denied" });

const accessRequestSchema = new mongoose.Schema(
    {
        docId: { type: mongoose.Schema.Types.ObjectId, ref: "Document", required: true },
        userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
        requestedRole: { type: String, enum: ["editor", "viewer"], default: "editor" },
        status: { type: String, enum: Object.values(STATUS), default: STATUS.PENDING },
        decidedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
        decidedAt: { type: Date, default: null },
    },
    { timestamps: { createdAt: true, updatedAt: true } }
);

// The owner's queue: "pending requests for this document".
accessRequestSchema.index({ docId: 1, status: 1, createdAt: -1 });

// One row per (document, user), so following a share link repeatedly cannot
// flood an owner's queue. A re-request after a denial updates this row rather
// than inserting a second one.
accessRequestSchema.index({ docId: 1, userId: 1 }, { unique: true });

const AccessRequest = mongoose.model("AccessRequest", accessRequestSchema);
AccessRequest.STATUS = STATUS;

module.exports = AccessRequest;
