/**
 * shared/ot/diff.js
 * ─────────────────────────────────────────────────────────────────────────────
 * Turns "the text was X, now it is Y" into the operations that made it so.
 *
 * Lives here rather than inside useOT so it is testable without React, and so
 * there is one implementation — the same reason client-sync.js was extracted.
 *
 * The document is a flat string: newlines are ordinary "\n" characters, not DOM
 * structure, so a pressed Enter diffs to insert("\n") exactly like any other
 * typed character. Nothing in this file needs to know about line breaks.
 */

/**
 * @param {string} oldText
 * @param {string} newText
 * @returns {null | object | object[]} an op, a [delete, insert] pair for a
 *          replacement, or null when nothing changed.
 */
export function diffToOp(oldText, newText) {
  if (oldText === newText) return null;

  // Longest common prefix.
  let start = 0;
  while (
    start < oldText.length &&
    start < newText.length &&
    oldText[start] === newText[start]
  ) start++;

  // Longest common suffix, not overlapping the prefix.
  let oldEnd = oldText.length;
  let newEnd = newText.length;
  while (
    oldEnd > start &&
    newEnd > start &&
    oldText[oldEnd - 1] === newText[newEnd - 1]
  ) { oldEnd--; newEnd--; }

  const deleted = oldText.slice(start, oldEnd);
  const inserted = newText.slice(start, newEnd);

  if (deleted.length > 0 && inserted.length === 0) {
    return { type: "delete", pos: start, len: deleted.length };
  }
  if (inserted.length > 0 && deleted.length === 0) {
    return { type: "insert", pos: start, text: inserted };
  }
  if (deleted.length > 0 && inserted.length > 0) {
    // A replacement: delete first, then insert at the same position.
    return [
      { type: "delete", pos: start, len: deleted.length },
      { type: "insert", pos: start, text: inserted },
    ];
  }
  return null;
}
