/**
 * shared/ot/transform.js
 * ─────────────────────────────────────────────────────────────────────────────
 * Named re-exports from the shared OT operations module.
 * Imported by:
 *   - server/src/services/otService.js
 *   - client/src/lib/ot/transform.js  (which re-exports this)
 *
 * Usage:
 *   const { transform, transformAgainst } = require("../../../shared/ot/transform");
 */

const { transform, transformAgainst } = require("./operations");

module.exports = { transform, transformAgainst };