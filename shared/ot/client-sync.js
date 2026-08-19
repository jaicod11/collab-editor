/**
 * shared/ot/client-sync.js
 * ─────────────────────────────────────────────────────────────────────────────
 * The client's pending/buffer state machine, as pure functions so it can be
 * tested without React. useOT.js holds this state in a ref and does nothing
 * else — there is no second copy of these rules in the hook.
 *
 * The client is always in one of three states:
 *   synchronised            pending === null, buffer empty
 *   awaiting confirm        pending !== null, buffer empty
 *   awaiting with buffer    pending !== null, buffer non-empty
 *
 * Only ONE op is outstanding at a time; everything typed while waiting queues
 * in `buffer`. Buffer entries are SEQUENTIAL — each was diffed against the
 * document as it stood after its predecessor — which is what makes threading
 * (rather than mapping) the correct way to rebase them.
 *
 * ── The bug this replaced ────────────────────────────────────────────────────
 * The old hook transformed buffered ops against the ACKED op on receipt of the
 * ack. But buffered ops were diffed against a local document that already had
 * the ORIGINAL pending op applied, and they had already been rebased by every
 * remote op that arrived in the meantime. Transforming them again against the
 * ack applied the same shift twice. The buffer needs no transformation at ack
 * time at all: receiveRemote() has already kept it in the right space.
 */

import { transform, isNoop } from "./operations.js";

/** Fresh, synchronised state. */
export function createSyncState() {
  return { pending: null, buffer: [] };
}

/**
 * The user made a local edit.
 * @returns {{ send: object|null }} the op to put on the wire, if any.
 */
export function applyLocal(state, op) {
  if (isNoop(op)) return { send: null };
  if (state.pending) {
    state.buffer.push(op);
    return { send: null };
  }
  state.pending = op;
  return { send: op };
}

/**
 * The server acknowledged the outstanding op.
 *
 * The buffer is deliberately NOT transformed here — see the header note.
 * @returns {{ send: object|null }} the next op to put on the wire, if any.
 */
export function receiveAck(state) {
  state.pending = null;
  const next = state.buffer.shift() ?? null;
  if (next) state.pending = next;
  return { send: next };
}

/**
 * A remote op arrived. Rebases the outstanding op and the whole buffer, and
 * returns the op expressed against the document the editor actually shows.
 * @returns {{ apply: object }}
 */
export function receiveRemote(state, remoteOp) {
  let incoming = remoteOp;

  if (state.pending) {
    const [nextPending, throughPending] = transform(state.pending, incoming);
    state.pending = nextPending;
    incoming = throughPending;
  }

  const nextBuffer = [];
  for (const buffered of state.buffer) {
    const [nextBuffered, throughBuffered] = transform(buffered, incoming);
    if (!isNoop(nextBuffered)) nextBuffer.push(nextBuffered);
    incoming = throughBuffered;
  }
  state.buffer = nextBuffer;

  return { apply: incoming };
}
