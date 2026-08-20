/**
 * server/test/presence.test.js
 * ─────────────────────────────────────────────────────────────────────────────
 * The presence roster, driven through real sockets against the local stack.
 *
 * Before Phase 4 the server only broadcast presence:join to sockets ALREADY in
 * the room, so whoever joined an active document saw nobody — and the client
 * subscribed to presence:update, which the server never emitted at all.
 *
 * NOTE: rooms.js is an in-process Map, so the roster is correct for a single
 * node only. These tests run one server process, which is the configuration the
 * feature currently supports.
 */

require("dotenv").config();
require("dotenv").config({ path: `${__dirname}/../.env.local`, override: true });

const { test, describe, before, after } = require("node:test");
const assert = require("node:assert/strict");
const { spawn } = require("node:child_process");
const http = require("node:http");
const path = require("node:path");
const { io } = require(path.join(__dirname, "../../client/node_modules/socket.io-client"));

const PORT = 4102;
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
        res.on("end", () => { try { resolve(JSON.parse(b)); } catch { reject(new Error(b)); } }); }
    );
    req.on("error", reject);
    if (data) req.write(data);
    req.end();
  });
}

let server;
const tokens = {};

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

  const stamp = Date.now();
  for (const who of ["ada", "linus"]) {
    const reg = await api("POST", "/api/auth/register", null, {
      name: who === "ada" ? "Ada Lovelace" : "Linus Torvalds",
      email: `p4-${who}-${stamp}@example.invalid`,
      password: "presencePass123",
    });
    tokens[who] = reg.token;
  }
}, { timeout: 40_000 });

after(async () => {
  for (const t of Object.values(tokens)) await api("DELETE", "/api/auth/me", t).catch(() => {});
  if (server && !server.killed) server.kill("SIGKILL");
  await wait(200);
});

function connect(token) {
  const s = io(`http://127.0.0.1:${PORT}`, { auth: { token }, transports: ["websocket"], reconnection: false });
  const st = { socket: s, roster: [], joins: [], leaves: [], loads: [], cursors: [] };
  s.on("presence:update", (m) => st.roster.push(m));
  s.on("presence:join", (m) => st.joins.push(m));
  s.on("presence:leave", (m) => st.leaves.push(m));
  s.on("presence:cursor", (m) => st.cursors.push(m));
  s.on("doc:load", (m) => st.loads.push(m));
  return st;
}

describe("presence roster", () => {
  test("a user joining an active document receives the existing members", async () => {
    const doc = await api("POST", "/api/documents", tokens.ada, { title: "Roster", content: "hi" });
    const docId = doc._id ?? doc.id;

    // Ada owns it; Linus gets in through the real share flow rather than a
    // hand-written database write — which also keeps this test honest about
    // the collaborator shape rather than encoding it twice.
    const share = await api("POST", `/api/documents/${docId}/share`, tokens.ada);
    await api("POST", `/api/documents/join/${share.shareToken}`, tokens.linus, { requestedRole: "editor" });
    const queue = await api("GET", `/api/documents/${docId}/requests`, tokens.ada);
    const pending = queue.requests[0];
    assert.ok(pending, "Linus's request reached Ada's queue");
    await api("POST", `/api/documents/${docId}/requests/${pending.id}/approve`, tokens.ada, { role: "editor" });

    // Ada joins an empty room: her roster is empty, which is correct.
    const ada = connect(tokens.ada);
    await wait(900);
    ada.socket.emit("doc:join", { docId });
    await wait(900);
    assert.equal(ada.roster.length, 1, "the joiner always gets exactly one roster");
    assert.deepEqual(ada.roster[0], [], "nobody else is in the room yet");

    // Linus joins the ACTIVE room. He must see Ada immediately — this is the
    // case that used to show an empty collaborator list.
    const linus = connect(tokens.linus);
    await wait(900);
    linus.socket.emit("doc:join", { docId });
    await wait(1200);

    assert.equal(linus.roster.length, 1, "one roster on join");
    assert.equal(linus.roster[0].length, 1, "Linus sees exactly one existing member");
    assert.equal(linus.roster[0][0].name, "Ada Lovelace");
    assert.ok(linus.roster[0][0].userId, "roster entries carry a userId");
    assert.equal(linus.roster[0][0].initials, "AL");

    // And Ada is told Linus arrived, via presence:join.
    assert.equal(ada.joins.length, 1, "Ada is notified of the later arrival");
    assert.equal(ada.joins[0].name, "Linus Torvalds");

    // The roster excludes self.
    assert.ok(!linus.roster[0].some((m) => m.name === "Linus Torvalds"), "roster excludes the joiner");

    ada.socket.close();
    linus.socket.close();
  });

  test("exactly one doc:load and one presence:update per doc:join", async () => {
    // Guards the duplicate-emit regression from the other direction: whatever
    // the client does, ONE doc:join must produce ONE of each.
    const doc = await api("POST", "/api/documents", tokens.ada, { title: "Once", content: "x" });
    const docId = doc._id ?? doc.id;

    const c = connect(tokens.ada);
    await wait(900);
    c.socket.emit("doc:join", { docId });
    await wait(1200);

    assert.equal(c.loads.length, 1, "one doc:load");
    assert.equal(c.roster.length, 1, "one presence:update");

    c.socket.close();
  });

  test("leaving a document removes the member from the next joiner's roster", async () => {
    const doc = await api("POST", "/api/documents", tokens.ada, { title: "Leave", content: "x" });
    const docId = doc._id ?? doc.id;

    const first = connect(tokens.ada);
    await wait(900);
    first.socket.emit("doc:join", { docId });
    await wait(700);
    first.socket.emit("doc:leave", { docId });
    await wait(700);

    // A fresh socket for the same user joins; the departed membership must be
    // gone from rooms.js, not lingering as a ghost.
    const second = connect(tokens.ada);
    await wait(900);
    second.socket.emit("doc:join", { docId });
    await wait(900);

    assert.deepEqual(second.roster[0], [], "no ghost member left behind by doc:leave");

    first.socket.close();
    second.socket.close();
  });
});
