/**
 * shared/test/client-sync.test.js
 * ─────────────────────────────────────────────────────────────────────────────
 * Exercises the real client state machine (shared/ot/client-sync.js — the same
 * module useOT.js uses) against a simulated server, so the client's local
 * document must end up byte-identical to the server's.
 *
 * The headline scenario is the one the audit flagged: local op pending, remote
 * op arrives, local op acked in TRANSFORMED form, buffered op flushed.
 */

import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { applyOp, transformAgainst } from "../ot/operations.js";
import {
  createSyncState, applyLocal, receiveAck, receiveRemote,
} from "../ot/client-sync.js";

const ins = (pos, text, site) => ({ type: "insert", pos, text, site });
const del = (pos, len, site) => ({ type: "delete", pos, len, site });

/**
 * Minimal model of documentHandler: keeps a document plus an op log, and
 * transforms each incoming op against everything applied since the submitter's
 * revision — exactly what the server does.
 */
function createServer(doc) {
  return {
    doc,
    revision: 0,
    log: [],
    submit(op, fromRevision) {
      const missed = this.log.slice(fromRevision).map((e) => e.op);
      const transformed = transformAgainst(op, missed);
      this.doc = applyOp(this.doc, transformed);
      this.revision += 1;
      this.log.push({ op: transformed, revision: this.revision });
      return { op: transformed, revision: this.revision };
    },
  };
}

describe("client ack path", () => {
  test("pending -> remote arrives -> ack in transformed form -> buffer flushed", () => {
    const base = "ABCDEFGH";
    const server = createServer(base);

    const state = createSyncState();
    let localDoc = base;

    // 1. Local edit while synchronised -> goes on the wire immediately.
    const op1 = ins(2, "XX", "alpha");
    localDoc = applyOp(localDoc, op1);
    assert.deepEqual(applyLocal(state, op1).send, op1, "first local op is sent");
    const submittedAtRevision = 0;

    // 2. More typing while the ack is outstanding -> buffered.
    const op2 = del(0, 1, "alpha");
    localDoc = applyOp(localDoc, op2);
    assert.equal(applyLocal(state, op2).send, null, "second local op is buffered");

    // 3. A remote op reaches the server FIRST and is broadcast to us. It lands
    //    BEFORE our pending op, so our op genuinely has to shift — otherwise
    //    the transform would be the identity and prove nothing.
    const remote = server.submit(ins(0, "ZZ", "bravo"), 0);
    localDoc = applyOp(localDoc, receiveRemote(state, remote.op).apply);

    // 4. Our first op now reaches the server. NOTE it is `op1` that travels on
    //    the wire — the copy the client rebased in step 3 is local bookkeeping
    //    only. The server transforms it against the remote op, so the ACK
    //    carries a DIFFERENT op than we submitted.
    const ack = server.submit(op1, submittedAtRevision);
    assert.notDeepEqual(ack.op, op1, "server acked a TRANSFORMED op, not the one we sent");
    assert.equal(ack.op.pos, op1.pos + 2, "shifted right by the remote insert");
    const { send: flushed } = receiveAck(state);

    // 5. The buffered op is flushed.
    assert.ok(flushed, "buffered op is flushed on ack");
    server.submit(flushed, ack.revision);
    receiveAck(state);

    assert.equal(localDoc, server.doc, "client document must equal server document");
    assert.deepEqual(state, { pending: null, buffer: [] }, "client ends synchronised");
  });

  test("the buffer is NOT re-transformed against the acked op", () => {
    // Regression guard: the old code applied the remote shift to buffered ops
    // twice — once in onBroadcast, once again in onAck.
    const state = createSyncState();
    applyLocal(state, ins(0, "A", "alpha"));       // pending
    applyLocal(state, ins(5, "B", "alpha"));       // buffered

    receiveRemote(state, ins(0, "ZZ", "bravo"));   // shifts the buffer by 2
    const shiftedPos = state.buffer[0].pos;

    receiveAck(state);                             // must not shift it again
    assert.equal(state.pending.pos, shiftedPos, "ack must not re-shift the buffer");
  });

  test("multi-op buffer is threaded, not mapped, through a remote op", () => {
    const base = "abcdefghij";
    const server = createServer(base);
    const state = createSyncState();
    let localDoc = base;

    let clientRevision = 0;
    let inFlight = null;

    for (const op of [ins(1, "P", "alpha"), ins(3, "Q", "alpha"), del(6, 2, "alpha")]) {
      localDoc = applyOp(localDoc, op);
      const { send } = applyLocal(state, op);
      // Whatever is handed to sendOp() leaves immediately, stamped with the
      // revision the client knows at that moment.
      if (send) inFlight = { op: send, atRevision: clientRevision };
    }

    const remote = server.submit(ins(0, "!!", "bravo"), 0);
    localDoc = applyOp(localDoc, receiveRemote(state, remote.op).apply);
    clientRevision = remote.revision;

    while (inFlight) {
      const res = server.submit(inFlight.op, inFlight.atRevision);
      clientRevision = res.revision;
      const { send } = receiveAck(state);
      inFlight = send ? { op: send, atRevision: clientRevision } : null;
    }

    assert.equal(localDoc, server.doc, "client converges after draining the buffer");
  });

  test("randomised: client and server converge over many interleavings", () => {
    let seed = 0x51DE >>> 0;
    const rand = () => {
      seed = (seed + 0x6d2b79f5) >>> 0;
      let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };

    for (let round = 0; round < 400; round++) {
      const base = "abcdefghijklmnop";
      const server = createServer(base);
      const state = createSyncState();
      let localDoc = base;
      let clientRevision = 0;
      let inFlight = null;

      const localCount = 1 + Math.floor(rand() * 3);
      for (let i = 0; i < localCount; i++) {
        const pos = Math.floor(rand() * Math.max(1, localDoc.length));
        const op = rand() < 0.5 ? ins(pos, "L", "alpha") : del(pos, 1, "alpha");
        localDoc = applyOp(localDoc, op);
        const { send } = applyLocal(state, op);
        if (send) inFlight = { op: send, atRevision: clientRevision };
      }

      const remoteCount = Math.floor(rand() * 3);
      for (let i = 0; i < remoteCount; i++) {
        const pos = Math.floor(rand() * Math.max(1, server.doc.length));
        const rOp = rand() < 0.5 ? ins(pos, "R", "bravo") : del(pos, 1, "bravo");
        const res = server.submit(rOp, server.revision);
        localDoc = applyOp(localDoc, receiveRemote(state, res.op).apply);
        clientRevision = res.revision;
      }

      while (inFlight) {
        const res = server.submit(inFlight.op, inFlight.atRevision);
        clientRevision = res.revision;
        const { send } = receiveAck(state);
        inFlight = send ? { op: send, atRevision: clientRevision } : null;
      }

      assert.equal(localDoc, server.doc, `round ${round} diverged (seed 0x51DE)`);
    }
  });
});
