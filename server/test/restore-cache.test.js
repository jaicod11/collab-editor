/**
 * server/test/restore-cache.test.js
 * ─────────────────────────────────────────────────────────────────────────────
 * Restore correctness, cache coherence, and room bookkeeping — against the real
 * server on the LOCAL dev stack.
 */

require("dotenv").config();
require("dotenv").config({ path: `${__dirname}/../.env.local`, override: true });

const { test, describe, before, after } = require("node:test");
const assert = require("node:assert/strict");
const { spawn } = require("node:child_process");
const http = require("node:http");
const path = require("node:path");
const { io } = require(path.join(__dirname, "../../client/node_modules/socket.io-client"));

const PORT = 4101;
if (!/(^|\/\/)(127\.0\.0\.1|localhost)(:|\/|$)/.test(process.env.MONGODB_URI ?? "")) {
  throw new Error("Refusing to run against a non-local database.");
}

const wait = (ms) => new Promise((r) => setTimeout(r, ms));

function api(method, pathname, token, body) {
  return new Promise((resolve, reject) => {
    const data = body ? JSON.stringify(body) : null;
    const req = http.request(
      { host: "127.0.0.1", port: PORT, path: pathname, method,
        headers: { "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
          ...(data ? { "Content-Length": Buffer.byteLength(data) } : {}) } },
      (res) => { let b = ""; res.on("data", (d) => (b += d));
        res.on("end", () => { try { resolve({ status: res.statusCode, body: JSON.parse(b) }); }
                              catch { reject(new Error(b)); } }); }
    );
    req.on("error", reject);
    if (data) req.write(data);
    req.end();
  });
}

let server;
let token;

before(async () => {
  server = spawn("node", ["src/index.js"], {
    cwd: path.join(__dirname, ".."),
    // The limiter stays in the request path; only its ceiling is raised,
    // because an integration suite legitimately makes hundreds of calls from
    // one address.
    env: { ...process.env, PORT: String(PORT), RATE_LIMIT_MAX: "100000" },
    stdio: ["ignore", "pipe", "pipe"],
  });
  await new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("server did not start")), 30_000);
    server.stdout.on("data", (d) => { if (d.toString().includes("Listening")) { clearTimeout(timer); resolve(); } });
    server.on("exit", (c) => { clearTimeout(timer); reject(new Error(`exited ${c}`)); });
  });
  const reg = await api("POST", "/api/auth/register", null, {
    name: "Restore Tester", email: `p3-restore-${Date.now()}@example.invalid`, password: "restorePass123",
  });
  token = reg.body.token;
}, { timeout: 40_000 });

after(async () => {
  if (token) await api("DELETE", "/api/auth/me", token).catch(() => {});
  if (server && !server.killed) server.kill("SIGKILL");
  await wait(200);
});

/** Connect a socket, join a document, resolve once doc:load arrives. */
async function joinDoc(docId) {
  const s = io(`http://127.0.0.1:${PORT}`, { auth: { token }, transports: ["websocket"], reconnection: false });
  const st = { socket: s, loads: [], errors: [], acks: [] };
  s.on("doc:load", (d) => st.loads.push(d));
  s.on("doc:error", (e) => st.errors.push(e));
  s.on("op:ack", (d) => st.acks.push(d));
  await wait(900);
  s.emit("doc:join", { docId });
  await wait(900);
  return st;
}

describe("restore picks the nearest snapshot at or before the target", () => {
  test("restoring an old revision returns THAT version, not the newest snapshot", { timeout: 120_000 }, async () => {
    const created = await api("POST", "/api/documents", token, { title: "Restore Target", content: "" });
    const docId = created.body._id ?? created.body.id;
    const c = await joinDoc(docId);

    // 60 single-character appends. SNAPSHOT_EVERY is 50, so a snapshot lands at
    // revision 50 — NEWER than the revision we will restore to. That is exactly
    // the case the old code got wrong: the replay range came out empty and the
    // caller silently received the rev-50 snapshot instead.
    let expectedAt10 = null;
    for (let i = 0; i < 60; i++) {
      const ch = String.fromCharCode(97 + (i % 26));
      c.socket.emit("op:submit", { docId, op: { type: "insert", pos: i, text: ch, site: "restore-site" }, revision: i });
      await wait(35);
      if (i === 9) expectedAt10 = c.acks.length; // 10 ops acked so far
    }
    await wait(2500);
    assert.equal(c.acks.length, 60, "all 60 edits acked");
    assert.ok(expectedAt10);

    const history = await api("GET", `/api/history/${docId}?limit=100`, token);
    const entries = history.body.history;
    const target = entries.find((h) => h.revision === 10);
    assert.ok(target, "revision 10 is in the history");

    // Independently derive what revision 10 should contain: the first 10 chars.
    const expected = "abcdefghij";

    const restored = await api("POST", `/api/history/${docId}/restore/${target.id}`, token);
    assert.equal(restored.status, 200, JSON.stringify(restored.body));
    assert.equal(restored.body.content, expected,
      "must be the requested version, not the rev-50 snapshot's content");
    assert.equal(restored.body.restoredFromRevision, 10);

    // And the stored document agrees.
    const after = await api("GET", `/api/documents/${docId}`, token);
    assert.equal(after.body.content, expected);

    c.socket.close();
  });
});

describe("cache coherence", () => {
  test("getOne works after a socket warmed the cache (one canonical shape)", async () => {
    const created = await api("POST", "/api/documents", token, { title: "Cache Shape", content: "hello" });
    const docId = created.body._id ?? created.body.id;

    // The socket handler warms doc:cache:{id} first...
    const c = await joinDoc(docId);
    assert.deepEqual(c.errors, [], "join succeeded");

    // ...then the REST layer reads that same entry. This used to 403 the owner
    // out of their own document, because the socket cached raw ObjectIds and
    // getOne looked for owner._id.
    const got = await api("GET", `/api/documents/${docId}`, token);
    assert.equal(got.status, 200, `owner must not be locked out: ${JSON.stringify(got.body)}`);

    // The owner must be an object with a name, not a bare id string — the
    // client renders this directly and used to show a raw ObjectId as a person.
    assert.equal(typeof got.body.owner, "object");
    assert.equal(got.body.owner.name, "Restore Tester");
    assert.ok(Array.isArray(got.body.collaborators));

    c.socket.close();
  });

  test("a restore leaves the cache in the canonical shape and keeps the real title", async () => {
    const created = await api("POST", "/api/documents", token, { title: "Keeps Its Name", content: "" });
    const docId = created.body._id ?? created.body.id;
    const c = await joinDoc(docId);

    for (let i = 0; i < 3; i++) {
      c.socket.emit("op:submit", { docId, op: { type: "insert", pos: i, text: "x", site: "s" }, revision: i });
      await wait(120);
    }
    await wait(500);

    const history = await api("GET", `/api/history/${docId}`, token);
    const first = history.body.history.find((h) => h.revision === 1);
    c.loads.length = 0;
    c.socket.emit("doc:restore", { docId, versionId: first.id });
    await wait(1200);

    assert.ok(c.loads.length > 0, "restore broadcasts doc:load");
    assert.equal(c.loads.at(-1).title, "Keeps Its Name",
      'must broadcast the real title, not the literal "Restored version"');

    // Owner still has access afterwards — the restore path used to cache only
    // { content, revision }, erasing owner and collaborators.
    const got = await api("GET", `/api/documents/${docId}`, token);
    assert.equal(got.status, 200, "owner still has access after a restore");
    assert.equal(got.body.owner.name, "Restore Tester");
    assert.equal(got.body.title, "Keeps Its Name");

    c.socket.close();
  });
});

describe("room bookkeeping", () => {
  test("doc:leave removes the member from the in-memory room map", async () => {
    // rooms.js is in-process state, so exercise it directly against the same
    // module the handler uses.
    const rooms = require("../src/socket/rooms");
    rooms.join("doc-A", { userId: "u1", name: "One", socketId: "sock-1" });
    rooms.join("doc-A", { userId: "u2", name: "Two", socketId: "sock-2" });
    assert.equal(rooms.getUserCount("doc-A"), 2);

    rooms.leave("doc-A", "sock-1");
    assert.equal(rooms.getUserCount("doc-A"), 1, "leaving drops the member");
    assert.ok(!rooms.hasUser("doc-A", "u1"));

    rooms.leave("doc-A", "sock-2");
    assert.equal(rooms.getMembers("doc-A").length, 0);
    assert.ok(!rooms.getActiveRooms().includes("doc-A"), "empty rooms are reaped");
  });

  test("the handler wires doc:leave to rooms.leave", async () => {
    // Guards the specific regression: doc:leave used to call socket.leave()
    // only, leaving a ghost member behind for the process lifetime.
    const source = require("node:fs").readFileSync(
      path.join(__dirname, "../src/socket/handlers/documentHandler.js"), "utf8"
    );
    const leaveBlock = source.slice(source.indexOf('socket.on("doc:leave"'), source.indexOf('socket.on("disconnect"'));
    assert.match(leaveBlock, /rooms\.leave\(docId, socket\.id\)/, "doc:leave must call rooms.leave");
  });
});
