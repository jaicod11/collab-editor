/**
 * lib/ot/operations.js
 * ─────────────────────────────────────────────────────────────────────────────
 * Re-export of the shared OT primitives. THERE IS NO ALGORITHM IN THIS FILE.
 *
 * The single source of truth is shared/ot/operations.js, which the server also
 * loads. This module exists only so app code can keep writing
 *   import { applyOp, transform } from "../lib/ot/operations";
 * without reaching across the repo with a relative path.
 *
 * "@shared" is aliased to ../../shared in client/vite.config.js.
 */
export {
  applyOp,
  applyOps,
  transform,
  transformAgainst,
  compose,
  isNoop,
  normalize,
  flatten,
  compareOps,
  NOOP,
} from "@shared/ot/operations.js";
