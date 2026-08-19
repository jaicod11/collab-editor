/**
 * shared/test/convergence.test.js
 * ─────────────────────────────────────────────────────────────────────────────
 * The property every OT implementation has to satisfy, and the specific
 * defects this suite exists to keep fixed.
 *
 * TP1 (convergence):
 *   applyOp(applyOp(d, A), B') === applyOp(applyOp(d, B), A')
 *   where [A', B'] = transform(A, B)
 *
 * TP1-swapped (cross-replica):
 *   Each replica evaluates the pair in its OWN argument order, so the real
 *   guarantee is
 *     applyOp(applyOp(d, A), transform(A, B)[1])
 *       === applyOp(applyOp(d, B), transform(B, A)[1])
 *   This is the property the old argument-order tie-break violated.
 *
 * Run: npm test
 */

import { test, describe } from "node:test";
import assert from "node:assert/strict";
import {
  applyOp, transform, transformAgainst, isNoop, flatten, compose,
} from "../ot/operations.js";

// ─── Helpers ─────────────────────────────────────────────────────────────────

const ins = (pos, text, site = "site-a") => ({ type: "insert", pos, text, site });
const del = (pos, len, site = "site-a") => ({ type: "delete", pos, len, site });

/** TP1 for one ordered pair. */
function converges(doc, a, b) {
  const [aP, bP] = transform(a, b);
  return applyOp(applyOp(doc, a), bP) === applyOp(applyOp(doc, b), aP);
}

/** TP1-swapped: both replicas transform in their own argument order. */
function convergesCrossReplica(doc, a, b) {
  const replicaA = applyOp(applyOp(doc, a), transform(a, b)[1]);
  const replicaB = applyOp(applyOp(doc, b), transform(b, a)[1]);
  return replicaA === replicaB;
}

/** The exact operation-pair space the audit swept. */
function auditOpSpace(site = "site-a") {
  const ops = [];
  for (let p = 0; p < 6; p++) {
    ops.push(ins(p, "xy", site));
    ops.push(ins(p, "z", site));
    for (let l = 1; l < 5; l++) ops.push(del(p, l, site));
  }
  return ops;
}

// ─── 1. Exhaustive sweep ─────────────────────────────────────────────────────

describe("exhaustive convergence sweep", () => {
  test("TP1 holds for every pair in the audit's operation space", () => {
    const doc = "ABCDEFGHIJ";
    const ops = auditOpSpace();
    const failures = [];

    for (const a of ops) {
      for (const b of ops) {
        if (!converges(doc, a, b)) failures.push([a, b]);
      }
    }

    assert.equal(
      failures.length,
      0,
      `${failures.length}/${ops.length ** 2} pairs diverged, e.g. ` +
        JSON.stringify(failures[0] ?? null)
    );
    assert.equal(ops.length ** 2, 1296, "op space should match the audit's 1296 pairs");
  });

  test("TP1-swapped holds across two sites (the real cross-replica case)", () => {
    const doc = "ABCDEFGHIJ";
    const ops = [...auditOpSpace("alpha"), ...auditOpSpace("bravo")];
    const failures = [];

    for (const a of ops) {
      for (const b of ops) {
        if (!convergesCrossReplica(doc, a, b)) failures.push([a, b]);
      }
    }

    assert.equal(
      failures.length,
      0,
      `${failures.length} pairs diverged across replicas, e.g. ` +
        JSON.stringify(failures[0] ?? null)
    );
  });
});

// ─── 2. Regression: the three audit defects ──────────────────────────────────

describe("regression — defect (a): overlapping deletes", () => {
  test("worked example: doc=ABCDEFGHIJ, A=delete(2,4), B=delete(4,4)", () => {
    const doc = "ABCDEFGHIJ";
    const a = del(2, 4); // "CDEF"
    const b = del(4, 4); // "EFGH"
    const [aP, bP] = transform(a, b);

    // Union {C,D,E,F,G,H} removed exactly once — NOT the union deleted twice.
    assert.equal(applyOp(applyOp(doc, a), bP), "ABIJ");
    assert.equal(applyOp(applyOp(doc, b), aP), "ABIJ");
  });

  test("each character is removed exactly once, never over-deleting", () => {
    const doc = "ABCDEFGHIJ";
    const a = del(2, 4);
    const b = del(4, 4);
    const [, bP] = transform(a, b);
    // Old code returned the union length (6); correct is the non-overlapping
    // remainder (2), because B already removed the overlap.
    assert.equal(flatten(bP).reduce((n, o) => n + o.len, 0), 2);
  });

  test("fully contained delete: B inside A leaves nothing for B to do", () => {
    const doc = "ABCDEFGHIJ";
    const a = del(1, 6); // [1,7)
    const b = del(3, 2); // [3,5) ⊂ A
    const [aP, bP] = transform(a, b);

    assert.ok(isNoop(bP), "B is fully absorbed by A");
    assert.equal(applyOp(applyOp(doc, a), bP), "AHIJ");
    assert.equal(applyOp(applyOp(doc, b), aP), "AHIJ");
  });

  test("identical deletes cancel to a noop, not a zero-length delete", () => {
    const a = del(2, 3);
    const b = del(2, 3);
    const [aP, bP] = transform(a, b);
    assert.ok(isNoop(aP) && isNoop(bP));
    for (const op of [aP, bP]) {
      assert.notEqual(op.type, "delete", "must not emit a {delete, len:0} sentinel");
    }
  });
});

describe("regression — defect (b): insert inside a concurrent delete", () => {
  test("worked example: doc=ABCDEFGH, A=insert(4,'XY'), B=delete(2,4)", () => {
    const doc = "ABCDEFGH";
    const a = ins(4, "XY");
    const b = del(2, 4); // removes "CDEF", and A lands strictly inside it
    const [aP, bP] = transform(a, b);

    // The typed text SURVIVES, clamped to the delete's start.
    assert.equal(applyOp(applyOp(doc, a), bP), "ABXYGH");
    assert.equal(applyOp(applyOp(doc, b), aP), "ABXYGH");
  });

  test("the insert is clamped to the delete's start position", () => {
    const [aP] = transform(ins(4, "XY"), del(2, 4));
    assert.equal(aP.type, "insert");
    assert.equal(aP.pos, 2, "clamped to bStart");
    assert.equal(aP.text, "XY");
  });

  test("insert at the exact delete boundaries is not treated as inside", () => {
    const doc = "ABCDEFGH";
    for (const pos of [2, 6]) {
      assert.ok(converges(doc, ins(pos, "XY"), del(2, 4)), `pos ${pos}`);
    }
  });

  test("symmetric direction: delete transformed against an inner insert", () => {
    const doc = "ABCDEFGH";
    const a = del(2, 4);
    const b = ins(4, "XY");
    assert.ok(converges(doc, a, b));
    assert.equal(applyOp(applyOp(doc, a), transform(a, b)[1]), "ABXYGH");
  });
});

describe("regression — defect (c): insert/insert tie-break", () => {
  test("transform(a,b)[0] equals transform(b,a)[1] at an equal position", () => {
    const a = ins(3, "AAA", "alpha");
    const b = ins(3, "BBB", "bravo");
    assert.deepEqual(transform(a, b)[0], transform(b, a)[1]);
    assert.deepEqual(transform(a, b)[1], transform(b, a)[0]);
  });

  test("the winner is decided by site, not by argument order", () => {
    const alpha = ins(3, "AAA", "alpha");
    const bravo = ins(3, "BBB", "bravo");
    // "alpha" < "bravo", so alpha's text lands first either way round.
    assert.equal(applyOp(applyOp("abcdef", alpha), transform(alpha, bravo)[1]), "abcAAABBBdef");
    assert.equal(applyOp(applyOp("abcdef", bravo), transform(bravo, alpha)[1]), "abcAAABBBdef");
  });

  test("the tie-break is antisymmetric for every site pairing", () => {
    const sites = ["alpha", "bravo", "charlie", "delta"];
    for (const sa of sites) {
      for (const sb of sites) {
        const a = ins(3, "AA", sa);
        const b = ins(3, "BB", sb);
        assert.ok(
          convergesCrossReplica("abcdef", a, b),
          `sites ${sa} vs ${sb} diverged`
        );
      }
    }
  });

  test("same site with identical text commutes (ops are interchangeable)", () => {
    const a = ins(3, "X", "same");
    const b = ins(3, "X", "same");
    assert.ok(convergesCrossReplica("abcdef", a, b));
  });

  test("ops missing a site still order deterministically", () => {
    const a = { type: "insert", pos: 3, text: "AAA" };
    const b = { type: "insert", pos: 3, text: "BBB" };
    assert.ok(convergesCrossReplica("abcdef", a, b));
  });
});

// ─── 3. No-op representation ─────────────────────────────────────────────────

describe("no-op representation", () => {
  test("a cancelled transform never yields a zero-length delete", () => {
    const ops = auditOpSpace();
    for (const a of ops) {
      for (const b of ops) {
        for (const out of transform(a, b)) {
          for (const prim of flatten(out)) {
            assert.ok(prim.len === undefined || prim.len > 0, JSON.stringify(prim));
            assert.ok(prim.text === undefined || prim.text.length > 0, JSON.stringify(prim));
          }
        }
      }
    }
  });

  test("applyOp treats a noop as the identity", () => {
    assert.equal(applyOp("hello", { type: "noop" }), "hello");
  });

  test("isNoop recognises every empty form", () => {
    assert.ok(isNoop({ type: "noop" }));
    assert.ok(isNoop({ type: "delete", pos: 0, len: 0 }));
    assert.ok(isNoop({ type: "insert", pos: 0, text: "" }));
    assert.ok(isNoop({ type: "batch", ops: [] }));
    assert.ok(!isNoop({ type: "insert", pos: 0, text: "a" }));
  });
});

// ─── 4. transformAgainst over a list ─────────────────────────────────────────

describe("transformAgainst composes over a list", () => {
  test("matches folding transform() by hand, one op at a time", () => {
    const doc = "ABCDEFGHIJ";
    const op = del(3, 4, "mine");
    const others = [ins(1, "zz", "other"), del(6, 2, "other"), ins(4, "q", "other")];

    let manual = op;
    for (const o of others) manual = transform(manual, o)[0];

    assert.deepEqual(transformAgainst(op, others), manual);
  });

  test("a client op catching up over N server ops lands on the server's document", () => {
    // Server applied `serverOps` after the client's base revision; the client's
    // op must transform into the server's coordinate space.
    const base = "ABCDEFGHIJ";
    const serverOps = [ins(0, "<<", "srv"), del(5, 3, "srv"), ins(4, "#", "srv")];
    const clientOp = ins(7, "!!", "cli");

    const serverDoc = serverOps.reduce(applyOp, base);
    const transformed = transformAgainst(clientOp, serverOps);
    const finalFromServer = applyOp(serverDoc, transformed);

    // Reaching the same document by transforming the server ops against the
    // client op instead must agree.
    let remaining = clientOp;
    let doc = base;
    const rebased = [];
    for (const s of serverOps) {
      const [r, sPrime] = transform(remaining, s);
      rebased.push(sPrime);
      remaining = r;
    }
    doc = applyOp(base, clientOp);
    for (const s of rebased) doc = applyOp(doc, s);

    assert.equal(finalFromServer, doc);
  });

  test("an empty list is the identity", () => {
    const op = ins(2, "x");
    assert.deepEqual(transformAgainst(op, []), op);
    assert.deepEqual(transformAgainst(op, undefined), op);
  });

  test("transforms correctly against a batch produced by an earlier split", () => {
    // delete(2,6) split around a concurrent insert becomes a batch; a third
    // op must still transform against it correctly.
    const doc = "ABCDEFGHIJ";
    const a = del(2, 6, "a");
    const b = ins(5, "XY", "b");
    const [, splitDelete] = transform(b, a); // batch of two deletes
    assert.equal(splitDelete.type, "batch");

    const c = ins(9, "!", "c");
    assert.ok(converges(applyOp(doc, b), c, splitDelete));
  });
});

// ─── 5. compose ──────────────────────────────────────────────────────────────

describe("compose", () => {
  test("an insert immediately undone by an equal delete cancels", () => {
    assert.equal(compose(ins(2, "xy"), del(2, 2)), null);
  });

  test("non-cancelling ops stay in application order (never a batch)", () => {
    const a = ins(0, "a");
    const b = ins(5, "b");
    const out = compose(a, b);
    assert.ok(Array.isArray(out), "sequential ops must not be collapsed into a batch");
    assert.deepEqual(out, [a, b]);
  });
});
