/**
 * server/src/services/historyService.js
 * ─────────────────────────────────────────────────────────────────────────────
 * Collapses the raw operation log into entries a person can read.
 *
 * Every keystroke is one Operation row — that granularity is load-bearing for
 * OT catch-up and for restore, so nothing here changes what is persisted. It
 * is a read-time view only.
 *
 * Without it, `GET /history?limit=20` returned the last twenty CHARACTERS
 * typed: a few seconds of one person's work, rendered as twenty rows reading
 * 'Inserted "y"'. That is why only ever one collaborator appeared in the panel.
 *
 * ── The grouping window ──────────────────────────────────────────────────────
 * Two minutes. Typing bursts are sub-second, so any window at all collapses a
 * sentence into one entry; the question is only where a *session* ends. Thirty
 * seconds splits a paragraph the moment someone pauses to think or check
 * something. Ten minutes merges the morning's work with the afternoon's. Two
 * minutes keeps one continuous stretch of writing together while still showing
 * "came back to it later" as a separate entry.
 */

const DEFAULT_WINDOW_MS = 2 * 60 * 1000;

/** Characters added and removed by a single op (handles batch and noop). */
function measure(op) {
    if (!op || typeof op !== "object") return { inserted: 0, removed: 0 };
    switch (op.type) {
        case "insert":
            return { inserted: typeof op.text === "string" ? op.text.length : 0, removed: 0 };
        case "delete":
            return { inserted: 0, removed: op.len > 0 ? op.len : 0 };
        case "batch":
            return (op.ops ?? []).reduce(
                (acc, sub) => {
                    const m = measure(sub);
                    return { inserted: acc.inserted + m.inserted, removed: acc.removed + m.removed };
                },
                { inserted: 0, removed: 0 }
            );
        default:
            return { inserted: 0, removed: 0 };
    }
}

function initialsOf(name) {
    return (name ?? "?")
        .split(" ")
        .map((n) => n[0])
        .join("")
        .toUpperCase()
        .slice(0, 2);
}

function plural(n, word) {
    return `${n} ${word}${n === 1 ? "" : "s"}`;
}

/** Human summary for an edit group. */
function describeEdit({ inserted, removed }) {
    if (inserted && removed) return `${plural(inserted, "character")} added, ${removed} removed`;
    if (inserted) return `${plural(inserted, "character")} added`;
    if (removed) return `${plural(removed, "character")} removed`;
    return "No net change";
}

const authorId = (op) => (op.userId?._id ?? op.userId)?.toString() ?? null;

/**
 * Group an operation log into readable entries.
 *
 * @param {object[]} ops  operations sorted DESCENDING by revision, userId populated
 * @param {{ windowMs?: number }} [options]
 * @returns {object[]} entries, newest first
 */
function coalesceOperations(ops, { windowMs = DEFAULT_WINDOW_MS } = {}) {
    const entries = [];

    for (const op of ops ?? []) {
        // A restore rewrites the whole document; it is never folded into a
        // neighbouring typing run.
        const isRestore = op.op?.type === "restore";
        const current = entries[entries.length - 1];

        const joinable =
            current &&
            !isRestore &&
            !current.isRestore &&
            current.authorId === authorId(op) &&
            // Contiguous: we are walking downwards, so the next op must sit
            // immediately below the group's current floor. A gap means
            // something else happened in between.
            current.fromRevision === op.revision + 1 &&
            // ...and within the session window of the group's oldest op so far.
            new Date(current.startedAt) - new Date(op.appliedAt) <= windowMs;

        if (joinable) {
            const m = measure(op.op);
            current.inserted += m.inserted;
            current.removed += m.removed;
            current.opCount += 1;
            current.fromRevision = op.revision;
            current.startedAt = op.appliedAt;
            continue;
        }

        const m = measure(op.op);
        entries.push({
            // The newest op in the group: restoring this entry restores to the
            // end of that run, which is what "restore to here" means.
            id: op._id,
            isRestore,
            authorId: authorId(op),
            revision: op.revision,
            toRevision: op.revision,
            fromRevision: op.revision,
            opCount: 1,
            author: {
                id: op.userId?._id ?? null,
                name: op.userId?.name ?? "Unknown",
                initials: initialsOf(op.userId?.name),
            },
            appliedAt: op.appliedAt,
            startedAt: op.appliedAt,
            inserted: m.inserted,
            removed: m.removed,
            restoredToRevision: isRestore ? op.op?.toRevision ?? null : null,
        });
    }

    // Attach the human summary once the counts are final.
    return entries.map((e) => ({
        ...e,
        description: e.isRestore
            ? `Restored the document to revision ${e.restoredToRevision ?? "?"}`
            : describeEdit(e),
    }));
}

module.exports = {
    coalesceOperations,
    DEFAULT_WINDOW_MS,
    // exported for tests
    _internal: { measure, describeEdit, initialsOf },
};
