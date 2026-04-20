/**
 * services/otService.js
 * ─────────────────────────────────────────────────────────────────────────────
 * Server-side wrapper around the shared OT primitives.
 * All conflict resolution lives here — the socket handler calls these methods.
 *
 * The shared/ot/operations.js module is used by BOTH client and server,
 * so the transform logic is identical on both ends.
 */

const { applyOp, applyOps, transform, transformAgainst, compose } =
  require("../../../shared/ot/operations");

module.exports = {
  /**
   * Transform a single incoming op against a list of concurrent ops
   * that were applied to the document since the client's revision.
   *
   * @param {object}   op            — incoming op from client
   * @param {object[]} concurrentOps — ops applied since client's revision
   * @returns {object}               — transformed op safe to apply
   */
  transformAgainst,

  /**
   * Apply a single operation to a document string.
   */
  applyOp,

  /**
   * Apply an ordered array of ops to a document string.
   */
  applyOps,

  /**
   * Compose two sequential ops into one (used for snapshot compression).
   */
  compose,

  /**
   * Validate that an op has the required shape before processing.
   * Prevents malformed client data from corrupting the document.
   */
  validateOp(op) {
    if (!op || typeof op !== "object") return false;
    if (op.type === "insert") {
      return (
        typeof op.pos  === "number" && op.pos  >= 0 &&
        typeof op.text === "string" && op.text.length > 0 &&
        op.text.length <= 10_000   // max single insert
      );
    }
    if (op.type === "delete") {
      return (
        typeof op.pos === "number" && op.pos >= 0 &&
        typeof op.len === "number" && op.len  > 0 &&
        op.len <= 100_000
      );
    }
    return false;
  },
};
