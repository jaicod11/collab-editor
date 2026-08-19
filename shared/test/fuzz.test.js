/**
 * shared/test/fuzz.test.js
 * ─────────────────────────────────────────────────────────────────────────────
 * Randomised property tests. The exhaustive sweep in convergence.test.js pins
 * a fixed grid; this explores shapes that grid never reaches — long documents,
 * multi-character inserts, deletes running off the end, and chains of ops.
 *
 * The RNG is seeded so a failure is reproducible: the seed is printed in the
 * assertion message.
 */

import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { applyOp, transform, transformAgainst, isNoop } from "../ot/operations.js";

/** Deterministic PRNG (mulberry32) so failures reproduce exactly. */
function rng(seed) {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const ALPHABET = "abcdefghijklmnopqrstuvwxyz";
const SITES = ["alpha", "bravo", "charlie", "delta"];

function randomDoc(rand, maxLen = 24) {
  const len = Math.floor(rand() * maxLen);
  let s = "";
  for (let i = 0; i < len; i++) s += ALPHABET[Math.floor(rand() * ALPHABET.length)];
  return s;
}

function randomOp(rand, doc) {
  const site = SITES[Math.floor(rand() * SITES.length)];
  if (doc.length === 0 || rand() < 0.5) {
    const textLen = 1 + Math.floor(rand() * 3);
    let text = "";
    for (let i = 0; i < textLen; i++) text += ALPHABET[Math.floor(rand() * ALPHABET.length)].toUpperCase();
    return { type: "insert", pos: Math.floor(rand() * (doc.length + 1)), text, site };
  }
  const pos = Math.floor(rand() * doc.length);
  const len = 1 + Math.floor(rand() * Math.max(1, doc.length - pos));
  return { type: "delete", pos, len, site };
}

describe("property: convergence under random input", () => {
  test("TP1 holds over 5000 random concurrent pairs", () => {
    const rand = rng(0xC0FFEE);
    for (let i = 0; i < 5000; i++) {
      const doc = randomDoc(rand);
      const a = randomOp(rand, doc);
      const b = randomOp(rand, doc);
      const [aP, bP] = transform(a, b);
      const left = applyOp(applyOp(doc, a), bP);
      const right = applyOp(applyOp(doc, b), aP);
      assert.equal(
        left, right,
        `iteration ${i} (seed 0xC0FFEE)\n  doc=${JSON.stringify(doc)}\n  A=${JSON.stringify(a)}\n  B=${JSON.stringify(b)}`
      );
    }
  });

  test("TP1-swapped holds over 5000 random concurrent pairs", () => {
    const rand = rng(0xBADF00D);
    for (let i = 0; i < 5000; i++) {
      const doc = randomDoc(rand);
      const a = randomOp(rand, doc);
      const b = randomOp(rand, doc);
      const replicaA = applyOp(applyOp(doc, a), transform(a, b)[1]);
      const replicaB = applyOp(applyOp(doc, b), transform(b, a)[1]);
      assert.equal(
        replicaA, replicaB,
        `iteration ${i} (seed 0xBADF00D)\n  doc=${JSON.stringify(doc)}\n  A=${JSON.stringify(a)}\n  B=${JSON.stringify(b)}`
      );
    }
  });

  test("no transform output ever contains an empty primitive", () => {
    const rand = rng(0x5EED);
    for (let i = 0; i < 3000; i++) {
      const doc = randomDoc(rand);
      const a = randomOp(rand, doc);
      const b = randomOp(rand, doc);
      for (const out of transform(a, b)) {
        if (isNoop(out)) {
          assert.equal(out.type, "noop", `empty result must be a noop, got ${JSON.stringify(out)}`);
        }
      }
    }
  });
});

describe("property: two replicas exchanging op chains converge", () => {
  test("N-op divergent branches reconcile to the same document (2000 rounds)", () => {
    const rand = rng(0xFEED);

    for (let round = 0; round < 2000; round++) {
      const base = randomDoc(rand, 20);

      // Each replica applies its own chain of local ops to the same base.
      const buildChain = () => {
        const ops = [];
        let doc = base;
        const n = 1 + Math.floor(rand() * 3);
        for (let i = 0; i < n; i++) {
          const op = randomOp(rand, doc);
          ops.push(op);
          doc = applyOp(doc, op);
        }
        return ops;
      };

      const aOps = buildChain();
      const bOps = buildChain();

      // Replica A: apply its own ops, then B's ops rebased onto A's branch.
      let docA = aOps.reduce(applyOp, base);
      let bRebased = bOps;
      for (const a of aOps) {
        const next = [];
        let carry = a;
        for (const b of bRebased) {
          const [bPrime, carryPrime] = transform(b, carry);
          next.push(bPrime);
          carry = carryPrime;
        }
        bRebased = next;
      }
      // The above rebases B against A's chain; apply the result.
      for (const b of bRebased) docA = applyOp(docA, b);

      // Replica B: mirror image.
      let docB = bOps.reduce(applyOp, base);
      let aRebased = aOps;
      for (const b of bOps) {
        const next = [];
        let carry = b;
        for (const a of aRebased) {
          const [aPrime, carryPrime] = transform(a, carry);
          next.push(aPrime);
          carry = carryPrime;
        }
        aRebased = next;
      }
      for (const a of aRebased) docB = applyOp(docB, a);

      assert.equal(
        docA, docB,
        `round ${round} (seed 0xFEED)\n  base=${JSON.stringify(base)}\n  A=${JSON.stringify(aOps)}\n  B=${JSON.stringify(bOps)}`
      );
    }
  });
});

describe("property: transformAgainst matches a manual fold", () => {
  test("2000 random op-vs-list cases", () => {
    const rand = rng(0x1234);
    for (let i = 0; i < 2000; i++) {
      const doc = randomDoc(rand);
      const op = randomOp(rand, doc);
      const others = [];
      let d = doc;
      const n = 1 + Math.floor(rand() * 4);
      for (let k = 0; k < n; k++) {
        const o = randomOp(rand, d);
        others.push(o);
        d = applyOp(d, o);
      }
      let manual = op;
      for (const o of others) manual = transform(manual, o)[0];
      assert.deepEqual(transformAgainst(op, others), manual, `iteration ${i}`);
    }
  });
});
