/**
 * server/test/roles.test.js
 * ─────────────────────────────────────────────────────────────────────────────
 * Owner-controlled role changes, against the real server on the LOCAL stack.
 *
 * The endpoint and the Share modal control both existed before this phase. What
 * did not work:
 *
 *   - An UPGRADE (viewer -> editor) notified the user with doc:error code
 *     VIEWER_READONLY — "you now have view-only access" — because the socket
 *     hook took `disconnect: false` to mean "downgraded". The client acted on
 *     it and made a freshly-promoted editor's surface read-only. The server
 *     accepted their writes; only the notification and the UI were inverted.
 *   - The OWNER's own role could be changed: roleOf() returned "owner", which
 *     is truthy, so the guard passed and addCollaborator PUSHED the owner into
 *     their own collaborator list. The document then had an owner who was also
 *     listed as a viewer, and the Share modal rendered them twice.
 *   - Having been pushed in, the owner could then remove themselves.
 */

require("dotenv").config();
require("dotenv").config({ path: `${__dirname}/../.env.local`, override: true });

const { test, describe, before, after } = require("node:test");
const assert = require("node:assert/strict");
const { spawn } = require("node:child_process");
const http = require("node:http");
const path = require("node:path");
const { io } = require(path.join(__dirname, "../../client/node_modules/socket.io-client"));

const PORT = 4111;
if (!/(^|\/\/)(127\.0\.0\.1|localhost)(:|\/|$)/.test(process.env.MONGODB_URI ?? "")) {
  throw new Error("Refusing to run against a non-local database.");
}

const wait = (ms) => new Promise((r) => setTimeout(r, ms));

function req(method, pathname, token, body) {
  return new Promise((resolve, reject) => {
    const data = body === undefined ? null : JSON.stringify(body);
    const r = http.request(
      { host: "127.0.0.1", port: PORT, path: pathname, method,
        headers: { "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
          ...(data ? { "Content-Length": Buffer.byteLength(data) } : {}) } },
      (res) => { let b = ""; res.on("data", (d) => (b += d));
        res.on("end", () => { let parsed = null; try { parsed = JSON.parse(b); } catch { /* empty */ }
          resolve({ status: res.statusCode, body: parsed }); }); }
    );
    r.on("error", reject);
    if (data) r.write(data);
    r.end();
  });
}

let server;
const U = {};

async function register(key, name) {
  const res = await req("POST", "/api/auth/register", null, {
    name, email: `p76-${key}-${Date.now()}-${Math.random().toString(36).slice(2)}@example.invalid`,
    password: "rolesPass1234",
  });
  const me = await req("GET", "/api/auth/me", res.body.token);
  U[key] = { token: res.body.token, id: me.body.id, name };
}

before(async () => {
  server = spawn("node", ["src/index.js"], {
    cwd: path.join(__dirname, ".."),
    env: { ...process.env, PORT: String(PORT), RATE_LIMIT_MAX: "100000" },
    stdio: ["ignore", "pipe", "pipe"],
  });
  await new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("server did not start")), 30_000);
    server.stdout.on("data", (d) => { if (d.toString().includes("Listening")) { clearTimeout(timer); resolve(); } });
    server.on("exit", (c) => { clearTimeout(timer); reject(new Error(`exited ${c}`)); });
  });
  await register("owner", "Owner Olga");
  await register("editor", "Editor Eli");
  await register("viewer", "Viewer Vic");
  await register("stranger", "Stranger Sam");
}, { timeout: 45_000 });

after(async () => {
  for (const u of Object.values(U)) await req("DELETE", "/api/auth/me", u.token).catch(() => {});
  if (server && !server.killed) server.kill("SIGKILL");
  await wait(200);
});

/** Document owned by `owner`, with an approved editor and viewer. */
async function seedDocument(content = "base") {
  const created = await req("POST", "/api/documents", U.owner.token, { title: "Roles", content });
  const docId = created.body._id ?? created.body.id;
  const share = await req("POST", `/api/documents/${docId}/share`, U.owner.token);

  for (const [key, role] of [["editor", "editor"], ["viewer", "viewer"]]) {
    await req("POST", `/api/documents/join/${share.body.shareToken}`, U[key].token, { requestedRole: role });
    const list = await req("GET", `/api/documents/${docId}/requests`, U.owner.token);
    const pending = list.body.requests.find((r) => String(r.userId) === String(U[key].id));
    await req("POST", `/api/documents/${docId}/requests/${pending.id}/approve`, U.owner.token, { role });
  }
  return docId;
}

function connect(authToken) {
  const s = io(`http://127.0.0.1:${PORT}`, { auth: { token: authToken }, transports: ["websocket"], reconnection: false });
  const st = { socket: s, loads: [], acks: [], errors: [], roleChanges: [] };
  s.on("doc:load", (d) => st.loads.push(d));
  s.on("op:ack", (d) => st.acks.push(d));
  s.on("doc:error", (e) => st.errors.push(e));
  s.on("access:role", (r) => st.roleChanges.push(r));
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("socket did not connect")), 15_000);
    s.on("connect", () => { clearTimeout(timer); resolve(st); });
    s.on("connect_error", (e) => { clearTimeout(timer); reject(e); });
  });
}

// ─── Authorisation matrix ────────────────────────────────────────────────────

describe("changing a role is owner-only", () => {
  test("editor, viewer and stranger all get 403 in both directions", async () => {
    const docId = await seedDocument();

    for (const who of ["editor", "viewer", "stranger"]) {
      for (const target of ["editor", "viewer"]) {
        for (const role of ["editor", "viewer"]) {
          const res = await req(
            "PATCH", `/api/documents/${docId}/collaborators/${U[target].id}`,
            U[who].token, { role }
          );
          assert.equal(
            res.status, 403,
            `${who} setting ${target} -> ${role} returned ${res.status}, expected 403`
          );
        }
      }
    }
  });

  test("a collaborator cannot promote THEMSELVES", async () => {
    const docId = await seedDocument();
    const res = await req(
      "PATCH", `/api/documents/${docId}/collaborators/${U.viewer.id}`,
      U.viewer.token, { role: "editor" }
    );
    assert.equal(res.status, 403);

    // ...and the stored role is untouched.
    const list = await req("GET", `/api/documents/${docId}/collaborators`, U.owner.token);
    const vic = list.body.collaborators.find((c) => String(c._id) === String(U.viewer.id));
    assert.equal(vic.role, "viewer");
  });

  test("the owner can change roles in both directions", async () => {
    const docId = await seedDocument();

    const up = await req("PATCH", `/api/documents/${docId}/collaborators/${U.viewer.id}`, U.owner.token, { role: "editor" });
    assert.equal(up.status, 200);
    assert.equal(up.body.role, "editor");

    const down = await req("PATCH", `/api/documents/${docId}/collaborators/${U.editor.id}`, U.owner.token, { role: "viewer" });
    assert.equal(down.status, 200);
    assert.equal(down.body.role, "viewer");

    const list = await req("GET", `/api/documents/${docId}/collaborators`, U.owner.token);
    const byId = Object.fromEntries(list.body.collaborators.map((c) => [String(c._id), c.role]));
    assert.equal(byId[String(U.viewer.id)], "editor", "the list reflects the change");
    assert.equal(byId[String(U.editor.id)], "viewer");
  });

  test("an invalid role is rejected", async () => {
    const docId = await seedDocument();
    for (const role of ["owner", "admin", "", null, 42]) {
      const res = await req("PATCH", `/api/documents/${docId}/collaborators/${U.viewer.id}`, U.owner.token, { role });
      assert.equal(res.status, 400, `role ${JSON.stringify(role)} should be rejected`);
    }
  });

  test("a non-collaborator cannot be given a role", async () => {
    const docId = await seedDocument();
    const res = await req("PATCH", `/api/documents/${docId}/collaborators/${U.stranger.id}`, U.owner.token, { role: "editor" });
    assert.equal(res.status, 404);
  });
});

// ─── The owner is not a collaborator ─────────────────────────────────────────

describe("the owner cannot be demoted or removed", () => {
  test("changing the owner's own role is refused", async () => {
    const docId = await seedDocument();
    const res = await req("PATCH", `/api/documents/${docId}/collaborators/${U.owner.id}`, U.owner.token, { role: "viewer" });
    assert.equal(res.status, 400);
    assert.match(res.body.message, /owner/i);
  });

  test("the owner is never pushed into their own collaborator list", async () => {
    const docId = await seedDocument();
    await req("PATCH", `/api/documents/${docId}/collaborators/${U.owner.id}`, U.owner.token, { role: "viewer" });

    const list = await req("GET", `/api/documents/${docId}/collaborators`, U.owner.token);
    const ids = list.body.collaborators.map((c) => String(c._id));
    assert.ok(!ids.includes(String(U.owner.id)), "the owner appeared in their own collaborator list");
    assert.equal(list.body.viewerRole, "owner", "and is still the owner");
  });

  test("the owner cannot remove themselves", async () => {
    const docId = await seedDocument();
    const res = await req("DELETE", `/api/documents/${docId}/collaborators/${U.owner.id}`, U.owner.token);
    assert.equal(res.status, 400);

    assert.equal(
      (await req("GET", `/api/documents/${docId}`, U.owner.token)).status, 200,
      "the owner still has access to their document"
    );
  });
});

// ─── Cache invalidation, both directions ─────────────────────────────────────

describe("a role change takes effect on an open socket", () => {
  test("UPGRADE viewer -> editor without a reconnect", async () => {
    const docId = await seedDocument("base");
    const c = await connect(U.viewer.token);
    c.socket.emit("doc:join", { docId });
    await wait(900);

    assert.equal(c.loads[0].role, "viewer", "joined as a viewer");
    c.errors.length = 0;
    c.roleChanges.length = 0;

    await req("PATCH", `/api/documents/${docId}/collaborators/${U.viewer.id}`, U.owner.token, { role: "editor" });
    await wait(1200);

    assert.equal(c.roleChanges.length, 1, "the user is told, on the same socket");
    assert.equal(c.roleChanges[0].role, "editor");
    assert.deepEqual(
      c.errors, [],
      "an upgrade must not arrive as doc:error — it used to say VIEWER_READONLY"
    );

    // The per-socket role cache must have been dropped, so the very next write
    // is accepted with no reconnect.
    c.socket.emit("op:submit", {
      docId, revision: c.loads[0].revision,
      op: { type: "insert", pos: 0, text: "E", site: "up" },
    });
    await wait(1000);

    assert.equal(c.acks.length, 1, "the promoted editor's write was accepted");
    const after = await req("GET", `/api/documents/${docId}`, U.owner.token);
    assert.equal(after.body.content, "Ebase");
    c.socket.close();
  });

  test("DOWNGRADE editor -> viewer without a reconnect", async () => {
    const docId = await seedDocument("base");
    const c = await connect(U.editor.token);
    c.socket.emit("doc:join", { docId });
    await wait(900);
    assert.equal(c.loads[0].role, "editor");

    c.roleChanges.length = 0;
    c.errors.length = 0;
    const acksBefore = c.acks.length;

    await req("PATCH", `/api/documents/${docId}/collaborators/${U.editor.id}`, U.owner.token, { role: "viewer" });
    await wait(1200);

    assert.equal(c.roleChanges.length, 1);
    assert.equal(c.roleChanges[0].role, "viewer");

    c.socket.emit("op:submit", {
      docId, revision: c.loads[0].revision,
      op: { type: "insert", pos: 0, text: "NO", site: "down" },
    });
    await wait(1000);

    assert.equal(c.acks.length, acksBefore, "no ack for a demoted editor");
    assert.ok(c.errors.some((e) => e.code === "VIEWER_READONLY"));
    const after = await req("GET", `/api/documents/${docId}`, U.owner.token);
    assert.equal(after.body.content, "base", "nothing was written");
    c.socket.close();
  });

  test("a round trip down and back up leaves the user able to write", async () => {
    const docId = await seedDocument("base");
    const c = await connect(U.editor.token);
    c.socket.emit("doc:join", { docId });
    await wait(900);

    await req("PATCH", `/api/documents/${docId}/collaborators/${U.editor.id}`, U.owner.token, { role: "viewer" });
    await wait(900);
    await req("PATCH", `/api/documents/${docId}/collaborators/${U.editor.id}`, U.owner.token, { role: "editor" });
    await wait(900);

    assert.deepEqual(c.roleChanges.map((r) => r.role), ["viewer", "editor"]);

    const acksBefore = c.acks.length;
    c.socket.emit("op:submit", {
      docId, revision: c.loads[0].revision,
      op: { type: "insert", pos: 0, text: "R", site: "rt" },
    });
    await wait(1000);
    assert.equal(c.acks.length, acksBefore + 1, "writing works again after the round trip");
    c.socket.close();
  });

  test("removal still disconnects, and is distinguishable from a role change", async () => {
    const docId = await seedDocument("base");
    const c = await connect(U.editor.token);
    c.socket.emit("doc:join", { docId });
    await wait(900);
    c.errors.length = 0;
    c.roleChanges.length = 0;

    await req("DELETE", `/api/documents/${docId}/collaborators/${U.editor.id}`, U.owner.token);
    await wait(1200);

    assert.ok(c.errors.some((e) => e.code === "ACCESS_REVOKED"), "removal is still an error event");
    assert.deepEqual(c.roleChanges, [], "and is not reported as a role change");
    c.socket.close();
  });
});
