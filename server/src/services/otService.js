/**
 * services/otService.js
 * ─────────────────────────────────────────────────────────────────────────────
 * Server-side wrapper around the shared OT primitives.
 * All conflict resolution lives here — the socket handler calls these methods.
 *
 * The shared/ot/operations.js module is used by BOTH client and server,
 * so the transform logic is identical on both ends.
 */

// NOTE: shared/ot is an ESM package. Node supports require() of ESM from
// v22.12 (see server/package.json engines). There is exactly one copy of this
// algorithm — do not re-implement it here or on the client.
const {
  applyOp, applyOps, transform, transformAgainst, compose, isNoop, normalize,
} = require("../../../shared/ot/operations.js");

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
   * True when a (possibly transformed) op has no effect on the document.
   */
  isNoop,

  /**
   * Collapse a list of primitive ops into a single op value.
   */
  normalize,

  /**
   * Validate that an op has the required shape before processing.
   * Prevents malformed client data from corrupting the document.
   *
   * `pos` and `len` are checked with Number.isInteger rather than
   * `typeof === "number"`: applyOp feeds them straight into String.slice,
   * which silently accepts fractional, NaN and Infinity indices and would
   * corrupt the document rather than reject the op.
   */
  validateOp(op) {
    if (!op || typeof op !== "object" || Array.isArray(op)) return false;

    // `site` is the insert/insert tie-break. Optional for backward
    // compatibility (ops predating it sort deterministically as ""), but when
    // present it must be a bounded string — it is persisted and compared on
    // every transform.
    if (op.site !== undefined) {
      if (typeof op.site !== "string" || op.site.length === 0 || op.site.length > 64) {
        return false;
      }
    }

    if (op.type === "insert") {
      return (
        Number.isInteger(op.pos) && op.pos >= 0 &&
        typeof op.text === "string" && op.text.length > 0 &&
        op.text.length <= 10_000   // max single insert
      );
    }
    if (op.type === "delete") {
      return (
        Number.isInteger(op.pos) && op.pos >= 0 &&
        Number.isInteger(op.len) && op.len  > 0 &&
        op.len <= 100_000
      );
    }
    return false;
  },
};
