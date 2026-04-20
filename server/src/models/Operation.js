/**
 * server/src/models/Operation.js
 * ─────────────────────────────────────────────────────────────────────────────
 * Append-only log of every OT operation applied to a document.
 * Each row represents one atomic edit at a specific revision.
 *
 * Used for:
 *   - Version history replay (historyController.js)
 *   - OT catch-up when a client is behind (documentHandler.js)
 *   - Snapshot compression (snapshotService.js)
 *
 * Previously exported from Document.js — now its own file.
 *
 * IMPORTANT: Update these two imports after adding this file:
 *   server/src/socket/handlers/documentHandler.js  → line 12
 *   server/src/controllers/historyController.js     → line 7
 *
 *   Change:
 *     const { Operation } = require("../models/Document");
 *   To:
 *     const Operation = require("../models/Operation");
 */

const mongoose = require("mongoose");

const operationSchema = new mongoose.Schema(
    {
        docId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "Document",
            required: true,
            index: true,
        },
        userId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "User",
            required: true,
        },
        revision: {
            type: Number,
            required: true,
        },
        op: {
            // { type: "insert", pos: number, text: string }
            // { type: "delete", pos: number, len:  number }
            type: mongoose.Schema.Types.Mixed,
            required: true,
        },
        appliedAt: {
            type: Date,
            default: Date.now,
        },
    },
    {
        // No updatedAt — this is an immutable append-only log
        timestamps: false,
        // Optimize for sequential reads by revision
        versionKey: false,
    }
);

// ── Compound index: fast range queries during OT catch-up ─────────────────────
// "Give me all ops for doc X between revisions 42 and 55"
operationSchema.index({ docId: 1, revision: 1 });

// ── TTL index: auto-delete ops older than 90 days (optional, saves disk) ──────
// Comment out if you need infinite history.
operationSchema.index(
    { appliedAt: 1 },
    { expireAfterSeconds: 60 * 60 * 24 * 90 }  // 90 days
);

module.exports = mongoose.model("Operation", operationSchema);