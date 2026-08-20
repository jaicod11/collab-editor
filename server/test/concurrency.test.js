/**
 * server/test/concurrency.test.js
 * ─────────────────────────────────────────────────────────────────────────────
 * Boots the real server against the LOCAL dev stack and fires genuinely
 * simultaneous op:submit calls at one document from many sockets.
 *
 * The property under test: a valid operation is never dropped. Before Phase 3
 * the admission path was `SET NX PX 100`, one 10ms retry, then doc:error
 * "Server busy" — which the client ignored, so the op vanished while the editor
 * still showed the text. Two simultaneous submissions were enough to trigger it.
 *
 * Also covers the lock primitives directly: FIFO serialisation and the
 * compare-and-delete release that stops a holder deleting someone else's lock.
 */

require("dotenv").config();
require("dotenv").config({ path: `${__dirname}/../.env.local`, override: true });

const { test, describe, before, after } = require("node:test");
const assert = require("node:assert/strict");
const { spawn } = require("node:child_process");
const http = require("node:http");
const path = require("node:path");
const { io } = require(path.join(__dirname, "../../client/node_modules/socket.io-client"));

const PORT = 4100;
const REDIS_URL = process.env.REDIS_URL ?? "";
const MONGODB_URI = process.env.MONGODB_URI ?? "";

const isLocal = (url) => /(^|\/\/)(127\.0\.0\.1|localhost)(:|\/|$)/.test(url);
if (!isLocal(REDIS_URL) || !isLocal(MONGODB_URI)) {
  throw new Error("Refusing to run concurrency tests against a non-local target.");
}

const wait = (ms) => new Promise((r) => setTimeout(r, ms));

function api(method, pathname, token, body) {
  return new Promise((resolve, reject) => {
    const data = body ? JSON.stringify(body) : null;
    const req = http.request(
      {
        host: "127.0.0.1", port: PORT, path: pathname, method,
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
          ...(data ? { "Content-Length": Buffer.byteLength(data) } : {}),
        },
      },
      (res) => {
        let b = "";
        res.on("data", (d) => (b += d));
        res.on("end", () => { try { resolve(JSON.parse(b)); } catch { reject(new Error(b)); } });
      }
    );
    req.on("error", reject);
    if (data) req.write(data);
    req.end();
  });
}

let server;

before(async () => {
  server = spawn("node", ["src/index.js"], {
    cwd: path.join(__dirname, ".."),
    env: { ...process.env, PORT: String(PORT) },
    stdio: ["ignore", "pipe", "pipe"],
  });
  // Wait for the listen line rather than a fixed sleep.
  await new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("server did not start in time")), 30_000);
    server.stdout.on("data", (d) => {
      if (d.toString().includes("Listening")) { clearTimeout(timer); resolve(); }
    });
    server.on("exit", (code) => { clearTimeout(timer); reject(new Error(`server exited: ${code}`)); });
  });
}, { timeout: 40_000 });

after(async () => {
  if (server && !server.killed) server.kill("SIGKILL");
  await wait(200);
});

describe("op:submit admission under concurrency", () => {
  test("no operation is dropped when many sockets submit at once", { timeout: 90_000 }, async () => {
    const BASE = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
    const SOCKETS = 8;
    const OPS_EACH = 6;

    const email = `p3-conc-${Date.now()}@example.invalid`;
    const { token } = await api("POST", "/api/auth/register", null, {
      name: "Concurrency", email, password: "concurrencyPass1",
    });
    const doc = await api("POST", "/api/documents", token, { title: "conc", content: BASE });
    const docId = doc._id ?? doc.id;

    const clients = [];
    for (let i = 0; i < SOCKETS; i++) {
      const s = io(`http://127.0.0.1:${PORT}`, { auth: { token }, transports: ["websocket"], reconnection: false });
      const st = { id: i, socket: s, acks: [], errors: [], loaded: null };
      s.on("doc:load", (d) => (st.loaded = d));
      s.on("op:ack", (d) => st.acks.push(d));
      s.on("doc:error", (e) => st.errors.push(e));
      clients.push(st);
    }
    await wait(1500);
    clients.forEach((c) => c.socket.emit("doc:join", { docId }));
    await wait(1500);

    const baseRev = clients[0].loaded.revision;

    // Each op inserts a distinct token at position 0. Whatever order the server
    // serialises them in, the final document must contain the base text plus
    // exactly one copy of every token.
    const submitted = [];
    for (let k = 0; k < OPS_EACH; k++) {
      for (const c of clients) {
        const tokenText = String.fromCharCode(97 + c.id) + k;
        submitted.push(tokenText);
        // No awaits between emits: maximally concurrent, all at the same base
        // revision, which is precisely what used to collide on the lock.
        c.socket.emit("op:submit", {
          docId,
          op: { type: "insert", pos: 0, text: tokenText, site: `site-${c.id}` },
          revision: baseRev,
        });
      }
    }

    await wait(8000);

    const final = await api("GET", `/api/documents/${docId}`, token);
    const acks = clients.reduce((n, c) => n + c.acks.length, 0);
    const errors = clients.flatMap((c) => c.errors);
    clients.forEach((c) => c.socket.close());

    assert.deepEqual(errors, [], "no doc:error should be emitted for valid ops");
    assert.equal(acks, submitted.length, "every submitted op is acked");

    const missing = submitted.filter((t) => !final.content.includes(t));
    assert.deepEqual(missing, [], "every submitted op is present in the final document");

    for (const t of submitted) {
      assert.equal(final.content.split(t).length - 1, 1, `op ${t} applied exactly once`);
    }

    assert.ok(final.content.includes(BASE), "base text is intact");
    const expectedLength = BASE.length + submitted.reduce((n, t) => n + t.length, 0);
    assert.equal(final.content.length, expectedLength, "final length accounts for every op");
    assert.equal(final.revision - baseRev, submitted.length, "revision advanced once per op");

    await api("DELETE", "/api/auth/me", token);
  });
});

describe("lock primitives", () => {
  const { redisClient, redisSub, connectRedis } = require("../src/config/redis");
  const lockService = require("../src/services/lockService");

  before(async () => { await connectRedis(); });
  after(async () => { await Promise.all([redisClient.quit(), redisSub.quit()]); });

  test("concurrent holders serialise instead of overlapping", async () => {
    const docId = `lock-test-${Date.now()}`;
    let active = 0;
    let maxActive = 0;
    const order = [];

    await Promise.all(
      Array.from({ length: 12 }, (_, i) =>
        lockService.withDocumentLock(redisClient, docId, async () => {
          active += 1;
          maxActive = Math.max(maxActive, active);
          order.push(i);
          await wait(5);
          active -= 1;
        })
      )
    );

    assert.equal(maxActive, 1, "never two holders at once");
    assert.equal(order.length, 12, "every caller got its turn — none were rejected");
    assert.deepEqual(order, [...order].sort((a, b) => a - b), "FIFO order preserved");
  });

  test("a thrown task still releases the lock", async () => {
    const docId = `lock-throw-${Date.now()}`;
    await assert.rejects(() =>
      lockService.withDocumentLock(redisClient, docId, async () => { throw new Error("boom"); })
    );
    // If the release leaked, this would block until the 10s TTL.
    const ran = await lockService.withDocumentLock(redisClient, docId, async () => "ok");
    assert.equal(ran, "ok");
  });

  test("an early return still releases the lock", async () => {
    const docId = `lock-return-${Date.now()}`;
    await lockService.withDocumentLock(redisClient, docId, async () => { return "early"; });
    assert.equal(await lockService.withDocumentLock(redisClient, docId, async () => "second"), "second");
  });

  test("release only deletes the holder's own lock", async () => {
    const key = `lock:doc:cad-${Date.now()}`;
    const { acquire, release } = lockService._internal;

    const mine = await acquire(redisClient, key, { ttlMs: 5000, waitMs: 100 });
    assert.ok(mine, "acquired");

    // Simulate a TTL expiry followed by someone else acquiring the same key.
    await redisClient.set(key, "someone-elses-token");

    await release(redisClient, key, mine);
    assert.equal(
      await redisClient.get(key),
      "someone-elses-token",
      "compare-and-delete must not remove another holder's lock"
    );
    await redisClient.del(key);
  });

  test("acquire times out rather than waiting forever", async () => {
    const key = `lock:doc:timeout-${Date.now()}`;
    const { acquire } = lockService._internal;
    const held = await acquire(redisClient, key, { ttlMs: 5000, waitMs: 100 });
    assert.ok(held);
    const second = await acquire(redisClient, key, { ttlMs: 5000, waitMs: 150 });
    assert.equal(second, null, "bounded wait returns null instead of hanging");
    await redisClient.del(key);
  });
});
