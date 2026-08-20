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
            // No single-field index here: the compound { docId, revision }
            // below already serves docId-only queries via its prefix. Declaring
            // both created a second index that cost writes and served nothing.
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
            // { type: "insert", pos: number, text: string, site: string }
            // { type: "delete", pos: number, len:  number, site: string }
            // { type: "batch",  ops: [ ...primitives ] }
            // A transform can split one delete into two disjoint ranges when a
            // concurrent insert lands inside it; that is stored as a "batch".
            // "noop" results are never persisted — they are acked and dropped.
            type: mongoose.Schema.Types.Mixed,
            required: true,
        },

        // Denormalised copy of op.site — the deterministic insert/insert
        // tie-break. It also lives inside `op` (which is what the transform
        // reads); this column exists so the ordering can be inspected and
        // queried without digging into a Mixed field.
        site: {
            type: String,
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

// ── NO TTL INDEX — deliberately ──────────────────────────────────────────────
//
// There used to be `index({ appliedAt: 1 }, { expireAfterSeconds: 90 days })`.
// This collection is the sole backing store for three things:
//   - getHistory (version history)
//   - restore's replay, via snapshotService.contentAtRevision
//   - op:submit's catch-up path when the Redis op cache misses
// At 90 days MongoDB silently deleted those rows: history emptied itself,
// restore reconstructed from an incomplete log, and a client that fell behind
// got a transform against ops that no longer existed. Nothing surfaced an
// error; the documents just quietly became wrong.
//
// If op-log growth becomes a problem, the retention strategy has to be built on
// snapshots rather than on time. Snapshots are now their own collection
// (models/Snapshot.js), so ops BELOW the oldest snapshot a product decision
// still wants reachable are genuinely redundant — the snapshot reconstructs
// that point directly. A safe policy is therefore "keep every snapshot; delete
// ops older than the Nth-oldest retained snapshot", applied as an explicit,
// logged, auditable job — not a TTL that deletes rows nobody is watching.

module.exports = mongoose.model("Operation", operationSchema);