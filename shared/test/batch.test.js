/**
 * shared/test/batch.test.js
 * ─────────────────────────────────────────────────────────────────────────────
 * Coverage for the two op shapes Phase 2 introduced — {type:"batch"} and
 * {type:"noop"} — in the positions Phase 2 left unverified.
 *
 * A batch is produced when a concurrent insert lands strictly inside a delete
 * range: the delete has to remove the text on either side of the insert while
 * leaving the inserted text alone, which is two disjoint ranges. Phase 2 only
 * exercised a batch in the FIRST argument of transform(). It reaches the second
 * argument whenever a batch is already in the op log and a later op has to
 * catch up over it — the ordinary path after any such concurrent edit.
 */

import { test, describe } from "node:test";
import assert from "node:assert/strict";
import {
  applyOp, transform, transformAgainst, isNoop, flatten, normalize,
} from "../ot/operations.js";
import {
  createSyncState, applyLocal, receiveAck, receiveRemote,
} from "../ot/client-sync.js";

const ins = (pos, text, site = "site-a") => ({ type: "insert", pos, text, site });
const del = (pos, len, site = "site-a") => ({ type: "delete", pos, len, site });

/** Produce a genuine batch: delete(2,6) split by a concurrent insert at 5. */
function makeBatch() {
  const [, split] = transform(ins(5, "XY", "b"), del(2, 6, "a"));
  assert.equal(split.type, "batch", "fixture must actually be a batch");
  return split;
}

const converges = (doc, a, b) => {
  const [aP, bP] = transform(a, b);
  return applyOp(applyOp(doc, a), bP) === applyOp(applyOp(doc, b), aP);
};

describe("batch in the SECOND argument position", () => {
  test("transform(primitive, batch) converges", () => {
    const batch = makeBatch();
    const doc = "ABCDEFGHIJ";
    const base = applyOp(doc, ins(5, "XY", "b")); // the space the batch lives in

    for (const other of [
      ins(0, "!", "c"), ins(4, "!", "c"), ins(9, "!", "c"),
      del(0, 2, "c"), del(3, 3, "c"), del(7, 2, "c"),
    ]) {
      assert.ok(converges(base, other, batch), `failed for ${JSON.stringify(other)}`);
    }
  });

  test("transform(batch, batch) converges", () => {
    const batch = makeBatch();
    const doc = applyOp("ABCDEFGHIJ", ins(5, "XY", "b"));
    assert.ok(converges(doc, batch, batch));
  });

  test("transformAgainst() accepts a batch inside the concurrent-ops list", () => {
    // This is the catch-up path: the op log already holds a batch and a client
    // that fell behind must transform over it.
    const batch = makeBatch();
    const doc = applyOp("ABCDEFGHIJ", ins(5, "XY", "b"));
    const clientOp = ins(8, "ZZ", "c");

    const list = [batch, ins(0, "<", "d")];
    const transformed = transformAgainst(clientOp, list);

    // Folding by hand must agree.
    let manual = clientOp;
    for (const o of list) manual = transform(manual, o)[0];
    assert.deepEqual(transformed, manual);

    // And the result must apply cleanly to the document the server would hold.
    const serverDoc = list.reduce(applyOp, doc);
    assert.doesNotThrow(() => applyOp(serverDoc, transformed));
  });

  test("a batch survives a JSON round trip (Redis cache / Mongo Mixed field)", () => {
    const batch = makeBatch();
    const revived = JSON.parse(JSON.stringify(batch));

    assert.deepEqual(revived, batch, "shape must survive serialisation");
    const doc = applyOp("ABCDEFGHIJ", ins(5, "XY", "b"));
    assert.equal(applyOp(doc, revived), applyOp(doc, batch), "and still apply identically");

    // It must also still work as a transform operand after the round trip —
    // this is what op:submit does with ops read back out of Redis or MongoDB.
    assert.deepEqual(transform(ins(0, "!", "c"), revived), transform(ins(0, "!", "c"), batch));
  });

  test("sub-ops of a batch are applied highest-position-first", () => {
    // Batch sub-ops share one coordinate space. Applying left-to-right would
    // shift the later ranges; the implementation must not depend on the order
    // they happen to be listed in.
    const doc = "0123456789";
    const forward = { type: "batch", ops: [del(1, 2), del(6, 2)] };
    const reversed = { type: "batch", ops: [del(6, 2), del(1, 2)] };
    assert.equal(applyOp(doc, forward), applyOp(doc, reversed));
    // removes "12" and "67", leaving 0,3,4,5,8,9
    assert.equal(applyOp(doc, forward), "034589");
  });
});

describe("noop handling", () => {
  test("transform() with a noop on either side is the identity", () => {
    const noop = { type: "noop" };
    const op = ins(3, "x");
    assert.deepEqual(transform(op, noop), [op, noop.type === "noop" ? { type: "noop" } : noop]);
    const [a, b] = transform(noop, op);
    assert.ok(isNoop(a));
    assert.deepEqual(b, op);
  });

  test("transformAgainst() skips noops in the list", () => {
    const op = ins(5, "z");
    const list = [{ type: "noop" }, ins(0, "ab"), { type: "noop" }];
    assert.deepEqual(transformAgainst(op, list), transform(op, ins(0, "ab"))[0]);
  });

  test("normalize() collapses empties to a noop, never a zero-length delete", () => {
    assert.deepEqual(normalize([]), { type: "noop" });
    assert.deepEqual(normalize([del(0, 0)]), { type: "noop" });
    assert.equal(flatten({ type: "batch", ops: [del(0, 0), ins(0, "")] }).length, 0);
  });
});

describe("client can handle a received batch", () => {
  test("applyOp on the client accepts a batch from op:broadcast", () => {
    const batch = makeBatch();
    const doc = applyOp("ABCDEFGHIJ", ins(5, "XY", "b"));
    assert.equal(applyOp(doc, batch), "ABXYIJ");
  });

  test("pending/buffer rebasing threads a batch correctly", () => {
    // Local edits outstanding, and the remote op that arrives is a batch.
    const state = createSyncState();
    applyLocal(state, ins(9, "P", "alpha"));   // pending
    applyLocal(state, ins(10, "Q", "alpha"));  // buffered

    const batch = makeBatch();
    const { apply } = receiveRemote(state, batch);

    assert.ok(apply, "a batch must produce something to apply");
    assert.ok(state.pending && !isNoop(state.pending), "pending survives rebasing");
    assert.equal(state.buffer.length, 1, "buffer survives rebasing");

    // And the whole exchange still converges against a server applying the same
    // ops in its own order.
    const base = applyOp("ABCDEFGHIJ", ins(5, "XY", "b"));
    let local = base;
    local = applyOp(local, ins(9, "P", "alpha"));
    local = applyOp(local, ins(10, "Q", "alpha"));
    local = applyOp(local, apply);

    let server = applyOp(base, batch);
    server = applyOp(server, state.pending);
    server = applyOp(server, state.buffer[0]);

    assert.equal(local, server, "client and server converge with a batch in play");
  });

  test("a noop received from op:ack leaves the buffer intact", () => {
    const state = createSyncState();
    applyLocal(state, ins(0, "A", "alpha"));
    applyLocal(state, ins(5, "B", "alpha"));
    const before = state.buffer[0];
    const { send } = receiveAck(state);
    assert.deepEqual(send, before, "the buffered op is flushed unchanged");
  });
});
