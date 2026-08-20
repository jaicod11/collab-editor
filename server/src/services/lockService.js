/**
 * server/src/services/lockService.js
 * ─────────────────────────────────────────────────────────────────────────────
 * Serialises work on a single document so concurrent op:submit calls queue
 * instead of racing.
 *
 * Two layers, because they solve different problems:
 *
 *   1. An in-process FIFO chain per docId. Almost all contention is between
 *      sockets on the SAME node (sticky sessions put a document's editors on
 *      one process), and a promise chain serialises those deterministically —
 *      no polling, no spinning, no possibility of losing a turn.
 *
 *   2. A Redis lock around the critical section, for the cross-node case the
 *      in-process chain cannot see.
 *
 * ── What this replaces ───────────────────────────────────────────────────────
 * The previous code did `SET NX PX 100`, retried once after 10ms, and then gave
 * up and told the client "Server busy, please retry". The client ignored that
 * event, so the operation was gone while the editor still showed the text —
 * permanent divergence. Two simultaneous submissions were enough to trigger it.
 *
 * Release used an unconditional `DEL`, which after a TTL expiry deletes
 * whichever holder happens to own the key at that moment. Release here is a
 * compare-and-delete against a token unique to the acquisition.
 */

const crypto = require("crypto");

// TTL is a crash safety net, not a concurrency control: the lock is released in
// a `finally`. It has to comfortably exceed the critical section (a few Mongo
// and Redis round trips), which the old 100ms did not — that is why holders
// routinely deleted each other's locks.
const DEFAULT_TTL_MS = 10_000;

// How long a caller will wait for its turn before giving up. Generous, because
// giving up means failing an operation the user has already typed.
const DEFAULT_WAIT_MS = 5_000;

// Compare-and-delete: only the holder that set this exact token may release.
const RELEASE_SCRIPT = `
if redis.call("get", KEYS[1]) == ARGV[1] then
  return redis.call("del", KEYS[1])
else
  return 0
end`;

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// ─── In-process FIFO chain, keyed by docId ───────────────────────────────────

const chains = new Map();

/**
 * Run `task` after every previously enqueued task for the same key.
 * Failures do not break the chain — the next task still runs.
 */
function enqueue(key, task) {
  const previous = chains.get(key) ?? Promise.resolve();
  // Swallow the predecessor's outcome so one failure cannot poison the queue.
  const result = previous.then(task, task);
  const tail = result.then(
    () => undefined,
    () => undefined
  );
  chains.set(key, tail);

  // Drop the entry once this task is the last one, so the map cannot grow
  // without bound across the process lifetime.
  tail.then(() => {
    if (chains.get(key) === tail) chains.delete(key);
  });

  return result;
}

/** Number of documents with queued work — exposed for tests and metrics. */
function pendingChains() {
  return chains.size;
}

// ─── Redis lock ──────────────────────────────────────────────────────────────

/**
 * Acquire with bounded waiting and exponential backoff.
 * @returns {Promise<string|null>} the release token, or null on timeout.
 */
async function acquire(redisClient, key, { ttlMs = DEFAULT_TTL_MS, waitMs = DEFAULT_WAIT_MS } = {}) {
  const token = crypto.randomUUID();
  const deadline = Date.now() + waitMs;
  let backoff = 5;

  for (;;) {
    const ok = await redisClient.set(key, token, { NX: true, PX: ttlMs });
    if (ok) return token;

    const remaining = deadline - Date.now();
    if (remaining <= 0) return null;

    await sleep(Math.min(backoff, remaining));
    backoff = Math.min(backoff * 2, 100);
  }
}

/**
 * Release only if we still hold it. A no-op when the TTL already expired and
 * someone else acquired — which is exactly the case the old unconditional DEL
 * got wrong.
 */
async function release(redisClient, key, token) {
  try {
    await redisClient.eval(RELEASE_SCRIPT, { keys: [key], arguments: [token] });
  } catch (err) {
    // A failed release is not fatal: the TTL will clear the key. Log it,
    // because a persistent failure here means locks are being held to TTL.
    console.error("[Lock] release failed:", err.message);
  }
}

// ─── Public API ──────────────────────────────────────────────────────────────

class LockTimeoutError extends Error {
  constructor(docId) {
    super(`Timed out waiting for the document lock (${docId})`);
    this.name = "LockTimeoutError";
    this.code = "LOCK_TIMEOUT";
  }
}

/**
 * Run `fn` with exclusive access to a document.
 *
 * The Redis lock is always released, including when `fn` throws or returns
 * early — that is the whole point of doing it here rather than inline in the
 * handler, where an early `return` inside the try block skipped the release.
 *
 * @throws {LockTimeoutError} if the lock could not be acquired within waitMs.
 */
function withDocumentLock(redisClient, docId, fn, options = {}) {
  const key = `lock:doc:${docId}`;

  return enqueue(key, async () => {
    const token = await acquire(redisClient, key, options);
    if (!token) throw new LockTimeoutError(docId);

    try {
      return await fn();
    } finally {
      await release(redisClient, key, token);
    }
  });
}

module.exports = {
  withDocumentLock,
  LockTimeoutError,
  pendingChains,
  // exported for tests
  _internal: { acquire, release, enqueue, RELEASE_SCRIPT, DEFAULT_TTL_MS, DEFAULT_WAIT_MS },
};
