/**
 * server/src/models/Snapshot.js
 * ─────────────────────────────────────────────────────────────────────────────
 * Point-in-time copies of a document's content, one row per snapshot.
 *
 * Replaces the single embedded `Document.snapshot` object, which was
 * overwritten every 50 revisions and therefore only ever held the MOST RECENT
 * snapshot. Restore replayed ops with `revision > snapshot.revision`, so asking
 * for a version older than the latest snapshot produced an empty replay range
 * and silently returned the snapshot's content instead — while reporting
 * success. Keeping every snapshot makes "nearest at or before revision N" a
 * query rather than a guess.
 *
 * `Document.snapshot` is left in place, unread, so existing rows are not
 * disturbed; it can be dropped once no deployment rolls back past this change.
 */

const mongoose = require("mongoose");

const snapshotSchema = new mongoose.Schema(
    {
        docId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "Document",
            required: true,
        },
        revision: {
            type: Number,
            required: true,
        },
        content: {
            type: String,
            required: true,
        },
        savedAt: {
            type: Date,
            default: Date.now,
        },
    },
    { timestamps: false, versionKey: false }
);

// The only query this collection serves: "newest snapshot at or before rev N
// for this document". A descending compound index answers it with a single
// index seek and no in-memory sort. Unique so a retried save cannot create two
// snapshots at the same revision.
snapshotSchema.index({ docId: 1, revision: -1 }, { unique: true });

module.exports = mongoose.model("Snapshot", snapshotSchema);
