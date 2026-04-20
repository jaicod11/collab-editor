/**
 * shared/ot/operations.js
 * ─────────────────────────────────────────────────────────────────────────────
 * Operational Transformation primitives.
 * Used by BOTH client (useOT.js) and server (otService.js).
 *
 * Operation types:
 *   { type: "insert", pos: number, text: string }
 *   { type: "delete", pos: number, len: number  }
 *   { type: "retain", len: number               }  ← used internally for compose
 *
 * Invariant: every op has a `revision` (server-assigned integer).
 */

/**
 * Apply a single operation to a string document.
 * Returns the new document string.
 */
function applyOp(doc, op) {
  switch (op.type) {
    case "insert":
      return doc.slice(0, op.pos) + op.text + doc.slice(op.pos);
    case "delete":
      return doc.slice(0, op.pos) + doc.slice(op.pos + op.len);
    default:
      return doc;
  }
}

/**
 * Apply an array of operations in sequence.
 */
function applyOps(doc, ops) {
  return ops.reduce(applyOp, doc);
}

/**
 * transform(opA, opB)
 * ─────────────────────────────────────────────────────────────────────────────
 * Classic OT transform for two concurrent ops that diverged from the same base.
 * Returns [opA', opB'] such that:
 *   apply(apply(doc, opA), opB') === apply(apply(doc, opB), opA')
 *
 * This is a simplified implementation covering the core insert/delete cases.
 * For production, consider using ot.js or ShareDB's json0 type.
 */
function transform(opA, opB) {
  // Both inserts
  if (opA.type === "insert" && opB.type === "insert") {
    if (opA.pos <= opB.pos) {
      // A comes first → shift B right by A's length
      return [
        opA,
        { ...opB, pos: opB.pos + opA.text.length },
      ];
    } else {
      return [
        { ...opA, pos: opA.pos + opB.text.length },
        opB,
      ];
    }
  }

  // Both deletes
  if (opA.type === "delete" && opB.type === "delete") {
    if (opA.pos + opA.len <= opB.pos) {
      // A is entirely before B → shift B left by A's length
      return [
        opA,
        { ...opB, pos: opB.pos - opA.len },
      ];
    } else if (opB.pos + opB.len <= opA.pos) {
      // B is entirely before A → shift A left by B's length
      return [
        { ...opA, pos: opA.pos - opB.len },
        opB,
      ];
    } else {
      // Overlapping deletes — resolve by merging
      const start = Math.min(opA.pos, opB.pos);
      const endA  = opA.pos + opA.len;
      const endB  = opB.pos + opB.len;
      const end   = Math.max(endA, endB);
      return [
        { type: "delete", pos: start, len: end - start },
        { type: "delete", pos: start, len: 0 },            // noop
      ];
    }
  }

  // Insert A, Delete B
  if (opA.type === "insert" && opB.type === "delete") {
    if (opA.pos <= opB.pos) {
      return [
        opA,
        { ...opB, pos: opB.pos + opA.text.length },
      ];
    } else if (opA.pos >= opB.pos + opB.len) {
      return [
        { ...opA, pos: opA.pos - opB.len },
        opB,
      ];
    } else {
      // A inserts inside B's delete range — keep both, adjust B
      return [
        opA,
        { ...opB, len: opB.len + opA.text.length },
      ];
    }
  }

  // Delete A, Insert B
  if (opA.type === "delete" && opB.type === "insert") {
    const [bPrime, aPrime] = transform(opB, opA); // swap + recurse
    return [aPrime, bPrime];
  }

  return [opA, opB]; // fallback — no-op
}

/**
 * transformAgainst(op, ops)
 * Transform a single op against an ordered list of concurrent ops.
 * Used by the server when an incoming op is behind multiple revisions.
 */
function transformAgainst(op, concurrentOps) {
  let current = op;
  for (const concurrentOp of concurrentOps) {
    [current] = transform(current, concurrentOp);
  }
  return current;
}

/**
 * compose(opA, opB)
 * Combine two sequential operations into one (for snapshot compression).
 * Simple version — extend as needed.
 */
function compose(opA, opB) {
  // insert followed by delete at the same position → cancel out
  if (
    opA.type === "insert" &&
    opB.type === "delete" &&
    opB.pos === opA.pos &&
    opB.len === opA.text.length
  ) {
    return null; // ops cancel
  }
  return [opA, opB]; // cannot compose — return both
}

module.exports = { applyOp, applyOps, transform, transformAgainst, compose };
