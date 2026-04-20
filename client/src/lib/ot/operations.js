/**
 * lib/ot/operations.js
 * ─────────────────────────────────────────────────────────────────────────────
 * Client-side re-export of the shared OT primitives.
 * Keeps import paths clean inside the React app:
 *
 *   import { applyOp, transform } from "../lib/ot/operations";
 *
 * instead of the longer relative path to shared/.
 *
 * The real logic lives in shared/ot/operations.js (used by server too).
 * In a monorepo setup this would be a workspace package import.
 * For now we duplicate just the exports so Vite can resolve them.
 */

// ─── applyOp ─────────────────────────────────────────────────────────────────
export function applyOp(doc, op) {
  switch (op.type) {
    case "insert":
      return doc.slice(0, op.pos) + op.text + doc.slice(op.pos);
    case "delete":
      return doc.slice(0, op.pos) + doc.slice(op.pos + op.len);
    default:
      return doc;
  }
}

export function applyOps(doc, ops) {
  return ops.reduce(applyOp, doc);
}

// ─── transform ───────────────────────────────────────────────────────────────
export function transform(opA, opB) {
  if (opA.type === "insert" && opB.type === "insert") {
    if (opA.pos <= opB.pos) return [opA, { ...opB, pos: opB.pos + opA.text.length }];
    return [{ ...opA, pos: opA.pos + opB.text.length }, opB];
  }
  if (opA.type === "delete" && opB.type === "delete") {
    if (opA.pos + opA.len <= opB.pos) return [opA, { ...opB, pos: opB.pos - opA.len }];
    if (opB.pos + opB.len <= opA.pos) return [{ ...opA, pos: opA.pos - opB.len }, opB];
    const start = Math.min(opA.pos, opB.pos);
    const end   = Math.max(opA.pos + opA.len, opB.pos + opB.len);
    return [{ type: "delete", pos: start, len: end - start }, { type: "delete", pos: start, len: 0 }];
  }
  if (opA.type === "insert" && opB.type === "delete") {
    if (opA.pos <= opB.pos) return [opA, { ...opB, pos: opB.pos + opA.text.length }];
    if (opA.pos >= opB.pos + opB.len) return [{ ...opA, pos: opA.pos - opB.len }, opB];
    return [opA, { ...opB, len: opB.len + opA.text.length }];
  }
  if (opA.type === "delete" && opB.type === "insert") {
    const [b2, a2] = transform(opB, opA);
    return [a2, b2];
  }
  return [opA, opB];
}

export function transformAgainst(op, concurrentOps) {
  let current = op;
  for (const c of concurrentOps) {
    [current] = transform(current, c);
  }
  return current;
}

// ─── compose ─────────────────────────────────────────────────────────────────
export function compose(opA, opB) {
  if (
    opA.type === "insert" && opB.type === "delete" &&
    opB.pos === opA.pos && opB.len === opA.text.length
  ) return null;
  return [opA, opB];
}
