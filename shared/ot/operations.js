/**
 * shared/ot/operations.js
 * ─────────────────────────────────────────────────────────────────────────────
 * Operational Transformation primitives — the SINGLE source of truth.
 * Loaded by the server (server/src/services/otService.js, via require()) and
 * by the client (client/src/lib/ot/operations.js, via the "@shared" Vite
 * alias). There is no second copy; do not restate this algorithm anywhere.
 *
 * ── Operation types ──────────────────────────────────────────────────────────
 *   { type: "insert", pos, text, site? }   insert text at pos
 *   { type: "delete", pos, len,  site? }   delete len chars at pos
 *   { type: "noop" }                       explicitly does nothing
 *   { type: "batch", ops: [...] }          several primitives, see below
 *
 * `noop` replaces the old `{type:"delete", len:0}` sentinel. A zero-length
 * delete is indistinguishable from a real edit in the op log and produced
 * "Deleted 0 characters" entries in version history; `noop` is explicit and is
 * filtered out before it ever reaches the log.
 *
 * `batch` exists because one case genuinely cannot be expressed as a single
 * primitive: when a concurrent insert lands strictly inside a delete range,
 * the transformed delete has to remove the text on either side of the insert
 * while leaving the inserted text alone — two disjoint ranges. Batch sub-ops
 * are SIMULTANEOUS: every `pos` is in the same coordinate space (the document
 * the batch is applied to), not relative to each other. applyOp therefore
 * applies them highest-position-first, so earlier removals cannot shift the
 * positions of later ones.
 *
 * ── Tie-break ────────────────────────────────────────────────────────────────
 * Two inserts at the same position need a total order that every replica
 * computes identically. `site` carries that order: a per-client-session id
 * stamped on the op when it is created and preserved through every transform.
 * See compareOps() for why it is not the userId.
 */

// ─── Constants & predicates ──────────────────────────────────────────────────

export const NOOP = Object.freeze({ type: "noop" });

/** True when an op has no effect on any document. */
export function isNoop(op) {
  if (!op || typeof op !== "object") return true;
  switch (op.type) {
    case "insert": return typeof op.text !== "string" || op.text.length === 0;
    case "delete": return !(op.len > 0);
    case "batch":  return flatten(op).length === 0;
    case "noop":   return true;
    default:       return true;
  }
}

/**
 * Reduce any op to the flat list of effective primitives it represents.
 * noop → [], batch → its (recursively flattened) sub-ops, empty edits → [].
 */
export function flatten(op) {
  if (!op || typeof op !== "object") return [];
  if (op.type === "noop") return [];
  if (op.type === "batch") return (op.ops ?? []).flatMap(flatten);
  if (op.type === "insert") return op.text?.length > 0 ? [op] : [];
  if (op.type === "delete") return op.len > 0 ? [op] : [];
  return [];
}

/** Collapse a list of primitives back into a single op value. */
export function normalize(ops) {
  const list = ops.flatMap(flatten);
  if (list.length === 0) return NOOP;
  if (list.length === 1) return list[0];
  return { type: "batch", ops: list };
}

// ─── Application ─────────────────────────────────────────────────────────────

/**
 * Apply a single operation to a string document. Returns the new string.
 * Positions are clamped so a malformed op can never throw here — the server
 * rejects malformed ops up front via otService.validateOp.
 */
export function applyOp(doc, op) {
  if (!op || typeof op !== "object") return doc;

  switch (op.type) {
    case "insert": {
      const pos = clamp(op.pos, 0, doc.length);
      return doc.slice(0, pos) + op.text + doc.slice(pos);
    }
    case "delete": {
      if (!(op.len > 0)) return doc;
      const pos = clamp(op.pos, 0, doc.length);
      return doc.slice(0, pos) + doc.slice(pos + op.len);
    }
    case "batch": {
      // Sub-ops share one coordinate space, so apply the rightmost first:
      // removing text at a higher position cannot shift a lower position.
      const ops = flatten(op).slice().sort((x, y) => y.pos - x.pos);
      return ops.reduce(applyOp, doc);
    }
    case "noop":
    default:
      return doc;
  }
}

/** Apply an ordered array of operations in sequence. */
export function applyOps(doc, ops) {
  return ops.reduce(applyOp, doc);
}

function clamp(n, lo, hi) {
  return n < lo ? lo : n > hi ? hi : n;
}

// ─── Tie-break ───────────────────────────────────────────────────────────────

/**
 * Total order used to break insert/insert ties at an identical position.
 *
 * It must be ANTISYMMETRIC — compareOps(a,b) === -compareOps(b,a) — because
 * the two replicas evaluate the pair in opposite argument orders. The old code
 * used "whichever op was passed first wins", which is not antisymmetric, so
 * the two sides derived different positions and desynchronised permanently.
 *
 * `site` is a per-client-session id, NOT the userId: one user with two tabs
 * open is two genuinely concurrent replicas, and they would tie forever on a
 * shared userId. It travels with the op through the wire and the op log so
 * every replica compares the same values.
 *
 * The text fallback only matters for ops predating `site`. Returning 0 is safe
 * because it can only happen when site AND text are equal, and two inserts of
 * identical text at an identical position commute.
 */
export function compareOps(a, b) {
  const sa = typeof a.site === "string" ? a.site : "";
  const sb = typeof b.site === "string" ? b.site : "";
  if (sa !== sb) return sa < sb ? -1 : 1;
  const ta = typeof a.text === "string" ? a.text : "";
  const tb = typeof b.text === "string" ? b.text : "";
  if (ta !== tb) return ta < tb ? -1 : 1;
  return 0;
}

// ─── Transform ───────────────────────────────────────────────────────────────

/**
 * Transform two PRIMITIVE ops that diverged from the same base document.
 * Returns [aPieces, bPieces] as lists, because one case produces two pieces.
 */
function transformPrim(a, b) {
  // ── insert / insert ────────────────────────────────────────────────────
  if (a.type === "insert" && b.type === "insert") {
    const aFirst = a.pos < b.pos || (a.pos === b.pos && compareOps(a, b) < 0);
    return aFirst
      ? [[a], [{ ...b, pos: b.pos + a.text.length }]]
      : [[{ ...a, pos: a.pos + b.text.length }], [b]];
  }

  // ── delete / delete ────────────────────────────────────────────────────
  if (a.type === "delete" && b.type === "delete") {
    const aS = a.pos, aE = a.pos + a.len;
    const bS = b.pos, bE = b.pos + b.len;

    // Characters both ops want gone must be removed exactly ONCE overall.
    // The old code returned the union range for A and a zero-length sentinel
    // for B, so the union was deleted a second time on top of B's own removal.
    const overlap = Math.max(0, Math.min(aE, bE) - Math.max(aS, bS));

    const aLen = a.len - overlap;
    const bLen = b.len - overlap;
    // Shift left by however much the other op removed strictly before us.
    const aPos = aS - clamp(aS - bS, 0, b.len);
    const bPos = bS - clamp(bS - aS, 0, a.len);

    return [
      aLen > 0 ? [{ ...a, pos: aPos, len: aLen }] : [],
      bLen > 0 ? [{ ...b, pos: bPos, len: bLen }] : [],
    ];
  }

  // ── insert / delete ────────────────────────────────────────────────────
  if (a.type === "insert" && b.type === "delete") {
    const bS = b.pos, bE = b.pos + b.len, L = a.text.length;

    if (a.pos <= bS) {
      // Insert lands at or before the deleted range: delete shifts right.
      return [[a], [{ ...b, pos: bS + L }]];
    }
    if (a.pos >= bE) {
      // Insert lands after the deleted range: insert shifts left.
      return [[{ ...a, pos: a.pos - b.len }], [b]];
    }

    // Insert lands STRICTLY INSIDE the deleted range. The insert is clamped to
    // the delete's start so the typed text survives (the old code left pos
    // untouched, which put it past the end of the shortened document and
    // duplicated or lost it). The delete then has to skip over the inserted
    // text, which needs two disjoint ranges — hence the batch.
    const leftLen  = a.pos - bS;       // deleted text before the insert
    const rightLen = bE - a.pos;       // deleted text after the insert
    const pieces = [];
    if (rightLen > 0) pieces.push({ ...b, pos: a.pos + L, len: rightLen });
    if (leftLen  > 0) pieces.push({ ...b, pos: bS,        len: leftLen  });
    return [[{ ...a, pos: bS }], pieces];
  }

  // ── delete / insert ────────────────────────────────────────────────────
  if (a.type === "delete" && b.type === "insert") {
    const [bPieces, aPieces] = transformPrim(b, a);
    return [aPieces, bPieces];
  }

  return [[a], [b]];
}

/**
 * transform(opA, opB) → [opA', opB']
 *
 * Guarantees convergence:
 *   applyOp(applyOp(doc, opA), opB') === applyOp(applyOp(doc, opB), opA')
 *
 * Either side may be a primitive, a noop, or a batch.
 */
export function transform(opA, opB) {
  const as = flatten(opA);
  const bs = flatten(opB);

  if (as.length === 0 || bs.length === 0) {
    // A no-op transforms the other side to itself.
    return [normalize(as), normalize(bs)];
  }
  if (as.length === 1 && bs.length === 1) {
    const [aPieces, bPieces] = transformPrim(as[0], bs[0]);
    return [normalize(aPieces), normalize(bPieces)];
  }
  return [normalize(transformSide(as, bs)), normalize(transformSide(bs, as))];
}

/**
 * Transform every piece of `mine` against all of `theirs`.
 *
 * `theirs` are simultaneous (one coordinate space), so they are folded
 * highest-position-first: a removal at a higher position leaves the
 * coordinates of everything below it untouched, which keeps each successive
 * transform operating on the space its input is actually expressed in.
 */
function transformSide(mine, theirs) {
  const ordered = theirs.slice().sort((x, y) => y.pos - x.pos);
  const out = [];
  for (const op of mine) {
    let pieces = [op];
    for (const other of ordered) {
      const next = [];
      for (const piece of pieces) next.push(...transformPrim(piece, other)[0]);
      pieces = next;
    }
    out.push(...pieces);
  }
  return out;
}

/**
 * transformAgainst(op, ops)
 * Transform a single op against an ordered list of concurrent ops — used by
 * the server when an incoming op is behind several revisions, and by the
 * client when flushing buffered ops.
 */
export function transformAgainst(op, concurrentOps) {
  let current = op;
  for (const concurrentOp of concurrentOps ?? []) {
    [current] = transform(current, concurrentOp);
  }
  return current;
}

// ─── Compose ─────────────────────────────────────────────────────────────────

/**
 * compose(opA, opB) — combine two SEQUENTIAL ops (opB applies after opA).
 *
 * Returns null when the pair cancels out entirely, otherwise an ARRAY of ops
 * to apply in order. Deliberately not a `batch`: batch sub-ops are
 * simultaneous (one coordinate space, applied highest-position-first), whereas
 * composed ops are sequential and order-dependent. Conflating the two would
 * silently reorder them.
 */
export function compose(opA, opB) {
  if (isNoop(opA)) return isNoop(opB) ? null : [opB];
  if (isNoop(opB)) return [opA];

  // insert immediately followed by a delete of exactly that text → cancels
  if (
    opA.type === "insert" &&
    opB.type === "delete" &&
    opB.pos === opA.pos &&
    opB.len === opA.text.length
  ) {
    return null;
  }
  return [opA, opB];
}
