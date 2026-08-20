/**
 * server/src/services/snapshotService.js
 * ─────────────────────────────────────────────────────────────────────────────
 * Writes periodic snapshots and reconstructs a document at any past revision.
 *
 * Reconstruction is: take the newest snapshot AT OR BEFORE the target revision,
 * then replay the op log forward from there to the target. With snapshots every
 * SNAPSHOT_EVERY revisions that is a bounded amount of replay regardless of how
 * old the target is.
 */

const Snapshot = require("../models/Snapshot");
const Operation = require("../models/Operation");
const otService = require("./otService");

/** Snapshot cadence, in revisions. */
const SNAPSHOT_EVERY = 50;

/**
 * Record a snapshot. Idempotent: a repeat at the same revision is ignored
 * rather than raising, so a retried write cannot fail an operation.
 */
async function save(docId, content, revision) {
    try {
        await Snapshot.updateOne(
            { docId, revision },
            { $setOnInsert: { docId, revision, content, savedAt: new Date() } },
            { upsert: true }
        );
        console.log(`[Snapshot] doc:${docId} saved at rev ${revision}`);
    } catch (err) {
        // Snapshots are an optimisation — never fail an edit because one could
        // not be written. Reconstruction still works, it just replays further.
        console.error("[Snapshot] Failed to save:", err.message);
    }
}

/**
 * Is this op structurally safe to replay?
 *
 * applyOp deliberately clamps positions so a live edit can never throw, which
 * means a malformed record replays into garbage rather than an error — an
 * insert missing `text` splices the literal string "undefined" into the
 * document. During reconstruction that is exactly the wrong trade: a corrupt
 * log must stop the replay, not quietly produce a plausible-looking document.
 */
function isApplicable(op) {
    if (!op || typeof op !== "object") return false;
    switch (op.type) {
        case "noop":
            return true;
        case "insert":
            return Number.isInteger(op.pos) && op.pos >= 0 && typeof op.text === "string";
        case "delete":
            return Number.isInteger(op.pos) && op.pos >= 0 && Number.isInteger(op.len) && op.len > 0;
        case "batch":
            return Array.isArray(op.ops) && op.ops.length > 0 && op.ops.every(isApplicable);
        default:
            return false;
    }
}

/** Newest snapshot at or before `revision`, or null when none exists. */
function nearestAtOrBefore(docId, revision) {
    return Snapshot.findOne({ docId, revision: { $lte: revision } })
        .sort({ revision: -1 })
        .lean();
}

/**
 * Reconstruct a document's content as of `targetRevision`.
 *
 * Throws if any op in the replay range fails to apply. The previous
 * implementation wrapped each application in `catch {}` and skipped failures,
 * which turned a corrupt op log into a silently wrong document presented to the
 * user as a successful restore. A wrong document is worse than an error.
 *
 * @throws {Error} statusCode 500 with `.detail` naming the offending revision
 */
async function contentAtRevision(docId, targetRevision) {
    const snapshot = await nearestAtOrBefore(docId, targetRevision);
    const baseRevision = snapshot?.revision ?? 0;
    let content = snapshot?.content ?? "";

    const ops = await Operation.find({
        docId,
        revision: { $gt: baseRevision, $lte: targetRevision },
    })
        .sort({ revision: 1 })
        .lean();

    for (const record of ops) {
        // A restore marker records an outcome, not a transformation — the
        // content it produced is captured by the snapshot cadence and by the
        // ops that follow, so replaying it is a no-op.
        if (record.op?.type === "restore") continue;

        const fail = (reason) => {
            const err = new Error(
                `Cannot reconstruct doc ${docId} at revision ${targetRevision}: ` +
                `operation at revision ${record.revision} ${reason}`
            );
            err.statusCode = 500;
            err.code = "REPLAY_FAILED";
            err.detail = { docId, targetRevision, failedRevision: record.revision, reason };
            return err;
        };

        if (!isApplicable(record.op)) throw fail("is malformed");

        try {
            content = otService.applyOp(content, record.op);
        } catch (cause) {
            throw fail(`failed to apply (${cause.message})`);
        }
    }

    return content;
}

module.exports = {
    SNAPSHOT_EVERY,
    isApplicable,
    save,
    nearestAtOrBefore,
    contentAtRevision,
};
