/**
 * services/snapshotService.js
 * ─────────────────────────────────────────────────────────────────────────────
 * Writes a document snapshot to MongoDB every N revisions.
 *
 * A snapshot stores a known-good (content, revision) pair so that version
 * history replay doesn't have to re-apply ALL ops from the beginning —
 * only ops since the last snapshot.
 *
 * Called by documentHandler after every 50th revision.
 */

const Document = require("../models/Document");

/**
 * Save a snapshot for a document.
 * @param {string} docId
 * @param {string} content   — full document text at this revision
 * @param {number} revision  — server revision number
 */
async function save(docId, content, revision) {
  try {
    await Document.findByIdAndUpdate(docId, {
      snapshot: { content, revision, savedAt: new Date() },
    });
    console.log(`[Snapshot] doc:${docId} saved at rev ${revision}`);
  } catch (err) {
    console.error("[Snapshot] Failed to save:", err);
  }
}

module.exports = { save };
