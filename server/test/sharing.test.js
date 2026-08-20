/**
 * server/test/sharing.test.js
 * ─────────────────────────────────────────────────────────────────────────────
 * Permission enforcement and the share/approval flow, against the real server
 * on the LOCAL dev stack.
 *
 * The security properties under test, each asserted explicitly:
 *   - a share token grants the ability to REQUEST access, never access itself
 *   - GET /join/:token leaks nothing beyond title and owner name
 *   - tokens are unguessable, and revocation is immediate
 *   - every owner-only endpoint rejects non-owners, INCLUDING collaborators
 *   - a viewer cannot write via op:submit, doc:restore, or any REST route
 */

require("dotenv").config();
require("dotenv").config({ path: `${__dirname}/../.env.local`, override: true });

const { test, describe, before, after } = require("node:test");
const assert = require("node:assert/strict");
const { spawn } = require("node:child_process");
const http = require("node:http");
const path = require("node:path");
const { io } = require(path.join(__dirname, "../../client/node_modules/socket.io-client"));

const PORT = 4104;
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
const U = {}; // role key -> { token, id, name }

/** Fail with the actual status and body rather than a downstream TypeError. */
function expectOk(res, label) {
  assert.ok(
    res.status >= 200 && res.status < 300,
    `${label} -> ${res.status} ${JSON.stringify(res.body)}`
  );
  return res.body;
}

async function register(key, name) {
  const res = await req("POST", "/api/auth/register", null, {
    name, email: `p5-${key}-${Date.now()}-${Math.random().toString(36).slice(2)}@example.invalid`,
    password: "sharingPass123",
  });
  const me = await req("GET", "/api/auth/me", res.body.token);
  U[key] = { token: res.body.token, id: me.body.id, name };
}

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

/** A document owned by `owner`, with an approved editor and viewer on it. */
async function seedDocument(title = "Shared Doc", content = "hello world") {
  const created = expectOk(
    await req("POST", "/api/documents", U.owner.token, { title, content }),
    "create document"
  );
  const docId = created._id ?? created.id;

  const share = expectOk(
    await req("POST", `/api/documents/${docId}/share`, U.owner.token),
    "enable share"
  );
  const token = share.shareToken;

  for (const [key, role] of [["editor", "editor"], ["viewer", "viewer"]]) {
    expectOk(
      await req("POST", `/api/documents/join/${token}`, U[key].token, { requestedRole: role }),
      `${key} requests access`
    );
    const list = expectOk(
      await req("GET", `/api/documents/${docId}/requests`, U.owner.token),
      "list requests"
    );
    const pending = list.requests.find((r) => String(r.userId) === String(U[key].id));
    assert.ok(pending, `${key}'s request not in the owner queue: ${JSON.stringify(list.requests)}`);
    expectOk(
      await req("POST", `/api/documents/${docId}/requests/${pending.id}/approve`, U.owner.token, { role }),
      `approve ${key}`
    );
  }
  return { docId, token };
}

/** Connect a socket and resolve once it is actually connected. */
function connectSocketAsync(authToken) {
  const st = connectSocket(authToken);
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("socket did not connect")), 15_000);
    st.socket.on("connect", () => { clearTimeout(timer); resolve(st); });
    st.socket.on("connect_error", (e) => { clearTimeout(timer); reject(e); });
  });
}

function connectSocket(authToken) {
  const s = io(`http://127.0.0.1:${PORT}`, { auth: { token: authToken }, transports: ["websocket"], reconnection: false });
  const st = { socket: s, loads: [], acks: [], errors: [], granted: [] };
  s.on("doc:load", (d) => st.loads.push(d));
  s.on("op:ack", (d) => st.acks.push(d));
  s.on("doc:error", (e) => st.errors.push(e));
  s.on("access:granted", (d) => st.granted.push(d));
  return st;
}

// ─── 1. Token grants the ability to ask, not access ──────────────────────────

describe("a share token is permission to ASK, never access itself", () => {
  test("holding the token does not let a stranger read the document", async () => {
    const { docId, token } = await seedDocument();

    const direct = await req("GET", `/api/documents/${docId}`, U.stranger.token);
    assert.equal(direct.status, 403, "the document itself stays closed");

    const resolved = await req("GET", `/api/documents/join/${token}`, U.stranger.token);
    assert.equal(resolved.status, 200);
    assert.equal(resolved.body.state, "no-access");

    // And the socket refuses them too.
    const s = await connectSocketAsync(U.stranger.token);
    s.socket.emit("doc:join", { docId });
    await wait(900);
    assert.equal(s.loads.length, 0, "no content delivered over the socket");
    assert.equal(s.errors[0]?.code, "ACCESS_DENIED");
    s.socket.close();
  });

  test("GET /join/:token leaks nothing beyond title and owner name", async () => {
    const { token } = await seedDocument("Secret Plans", "TOP SECRET CONTENT");
    const { body } = await req("GET", `/api/documents/join/${token}`, U.stranger.token);

    assert.deepEqual(
      Object.keys(body).sort(),
      ["ownerName", "requestedRole", "state", "title"].sort(),
      `unexpected fields exposed: ${JSON.stringify(body)}`
    );
    assert.equal(body.title, "Secret Plans");
    assert.equal(body.ownerName, "Owner Olga");

    const serialised = JSON.stringify(body);
    assert.ok(!serialised.includes("TOP SECRET"), "content must never appear");
    assert.ok(!serialised.includes("@example.invalid"), "owner email must never appear");
    assert.equal(body.docId, undefined, "document id is withheld from non-members");
    assert.equal(body.collaborators, undefined, "collaborator list is withheld");
  });

  test("someone who already has access gets the docId so they can go straight in", async () => {
    const { token } = await seedDocument();
    const { body } = await req("GET", `/api/documents/join/${token}`, U.editor.token);
    assert.equal(body.state, "has-access");
    assert.ok(body.docId, "members receive the id — it is what lets them navigate");
    assert.equal(body.role, "editor");
  });

  test("requesting twice does not queue two requests", async () => {
    const { docId, token } = await seedDocument();
    await req("POST", `/api/documents/join/${token}`, U.stranger.token, {});
    await req("POST", `/api/documents/join/${token}`, U.stranger.token, {});
    await req("POST", `/api/documents/join/${token}`, U.stranger.token, {});

    const list = await req("GET", `/api/documents/${docId}/requests`, U.owner.token);
    const mine = list.body.requests.filter((r) => String(r.userId) === String(U.stranger.id));
    assert.equal(mine.length, 1, "the unique (docId,userId) index collapses repeats");
  });
});

// ─── 2. Token strength and revocation ────────────────────────────────────────

describe("tokens are unguessable and revocation is immediate", () => {
  test("token is 256 bits of hex", async () => {
    const { token } = await seedDocument();
    assert.match(token, /^[0-9a-f]{64}$/, "32 random bytes, hex-encoded");
  });

  test("two documents never share a token", async () => {
    const a = await seedDocument("A");
    const b = await seedDocument("B");
    assert.notEqual(a.token, b.token);
  });

  test("revoking kills the link immediately", async () => {
    const { docId, token } = await seedDocument();
    assert.equal((await req("GET", `/api/documents/join/${token}`, U.stranger.token)).status, 200);

    await req("DELETE", `/api/documents/${docId}/share`, U.owner.token);

    const after = await req("GET", `/api/documents/join/${token}`, U.stranger.token);
    assert.equal(after.status, 404, "the token stops resolving at once");

    const tryJoin = await req("POST", `/api/documents/join/${token}`, U.stranger.token, {});
    assert.equal(tryJoin.status, 404, "and cannot be used to request access");
  });

  test("revoking the link does NOT remove existing collaborators", async () => {
    const { docId } = await seedDocument();
    await req("DELETE", `/api/documents/${docId}/share`, U.owner.token);

    const editorView = await req("GET", `/api/documents/${docId}`, U.editor.token);
    assert.equal(editorView.status, 200, "an approved collaborator keeps their access");

    const collabs = await req("GET", `/api/documents/${docId}/collaborators`, U.owner.token);
    assert.equal(collabs.body.collaborators.length, 2, "both collaborators are still listed");
  });

  test("re-enabling after a revoke issues a fresh token", async () => {
    const { docId, token: first } = await seedDocument();
    await req("DELETE", `/api/documents/${docId}/share`, U.owner.token);
    const again = await req("POST", `/api/documents/${docId}/share`, U.owner.token);
    assert.notEqual(again.body.shareToken, first, "the leaked link stays dead");
    assert.equal((await req("GET", `/api/documents/join/${first}`, U.stranger.token)).status, 404);
  });
});

// ─── 3. Owner-only endpoints ─────────────────────────────────────────────────

describe("owner-only endpoints reject non-owners, including collaborators", () => {
  test("every management route refuses an editor, a viewer and a stranger", async () => {
    const { docId } = await seedDocument();
    const reqList = await req("GET", `/api/documents/${docId}/requests`, U.owner.token);
    const anyReqId = reqList.body.requests[0]?.id ?? "000000000000000000000000";

    const routes = [
      ["POST", `/api/documents/${docId}/share`, undefined],
      ["DELETE", `/api/documents/${docId}/share`, undefined],
      ["GET", `/api/documents/${docId}/requests`, undefined],
      ["POST", `/api/documents/${docId}/requests/${anyReqId}/approve`, { role: "editor" }],
      ["POST", `/api/documents/${docId}/requests/${anyReqId}/deny`, {}],
      ["PATCH", `/api/documents/${docId}/collaborators/${U.viewer.id}`, { role: "editor" }],
      ["DELETE", `/api/documents/${docId}/collaborators/${U.viewer.id}`, undefined],
    ];

    for (const who of ["editor", "viewer", "stranger"]) {
      for (const [method, url, body] of routes) {
        const res = await req(method, url, U[who].token, body);
        assert.equal(
          res.status, 403,
          `${who} got ${res.status} from ${method} ${url} — expected 403`
        );
      }
    }
  });

  test("the owner can use all of them", async () => {
    const { docId } = await seedDocument();
    assert.equal((await req("GET", `/api/documents/${docId}/requests`, U.owner.token)).status, 200);
    assert.equal((await req("PATCH", `/api/documents/${docId}/collaborators/${U.viewer.id}`, U.owner.token, { role: "editor" })).status, 200);
    assert.equal((await req("DELETE", `/api/documents/${docId}/collaborators/${U.viewer.id}`, U.owner.token)).status, 200);
  });

  test("collaborator list is readable by members but hides the token from non-owners", async () => {
    const { docId } = await seedDocument();

    const asOwner = await req("GET", `/api/documents/${docId}/collaborators`, U.owner.token);
    assert.equal(asOwner.status, 200);
    assert.ok(asOwner.body.shareToken, "owner sees the token");

    const asEditor = await req("GET", `/api/documents/${docId}/collaborators`, U.editor.token);
    assert.equal(asEditor.status, 200, "members may see who else has access");
    assert.equal(asEditor.body.shareToken, undefined, "but never the token");
    assert.equal(asEditor.body.shareLink, undefined);
    assert.equal(asEditor.body.viewerRole, "editor");

    const asStranger = await req("GET", `/api/documents/${docId}/collaborators`, U.stranger.token);
    assert.equal(asStranger.status, 403);
  });
});

// ─── 4. Viewers cannot write ─────────────────────────────────────────────────

describe("a viewer cannot write, by any route", () => {
  test("op:submit from a viewer is rejected and changes nothing", async () => {
    const { docId } = await seedDocument("Viewer Test", "original");

    const v = await connectSocketAsync(U.viewer.token);
    v.socket.emit("doc:join", { docId });
    await wait(900);

    assert.equal(v.loads.length, 1, "a viewer may READ the document");
    assert.equal(v.loads[0].role, "viewer", "and is told their role");

    v.socket.emit("op:submit", {
      docId, revision: v.loads[0].revision,
      op: { type: "insert", pos: 0, text: "HACK", site: "viewer-site" },
    });
    await wait(1200);

    assert.equal(v.acks.length, 0, "no ack");
    assert.equal(v.errors.at(-1)?.code, "VIEWER_READONLY");

    const after = await req("GET", `/api/documents/${docId}`, U.owner.token);
    assert.equal(after.body.content, "original", "document is untouched");
    v.socket.close();
  });

  test("doc:restore from a viewer is rejected", async () => {
    const { docId } = await seedDocument("Restore Test", "");

    // The editor makes a couple of edits so there is a version to restore to.
    const e = await connectSocketAsync(U.editor.token);
    e.socket.emit("doc:join", { docId });
    await wait(700);
    e.socket.emit("op:submit", { docId, revision: 0, op: { type: "insert", pos: 0, text: "abc", site: "ed" } });
    await wait(700);
    assert.equal(e.acks.length, 1, "the editor CAN write");

    const history = await req("GET", `/api/history/${docId}`, U.owner.token);
    const versionId = history.body.history[0].id;

    const v = await connectSocketAsync(U.viewer.token);
    v.socket.emit("doc:join", { docId });
    await wait(700);
    v.socket.emit("doc:restore", { docId, versionId });
    await wait(1000);

    assert.equal(v.errors.at(-1)?.code, "VIEWER_READONLY");
    e.socket.close();
    v.socket.close();
  });

  test("a viewer cannot rename, archive or delete over REST", async () => {
    const { docId } = await seedDocument();
    // PATCH /:id is owner-only, so it 404s (not found OR access denied) for a
    // viewer rather than silently succeeding.
    const rename = await req("PATCH", `/api/documents/${docId}`, U.viewer.token, { title: "hijacked" });
    assert.equal(rename.status, 404);
    const del = await req("DELETE", `/api/documents/${docId}`, U.viewer.token);
    assert.equal(del.status, 404);

    const after = await req("GET", `/api/documents/${docId}`, U.owner.token);
    assert.notEqual(after.body.title, "hijacked");
  });

  test("an editor CAN write — the restriction is the role, not the mechanism", async () => {
    const { docId } = await seedDocument("Editor Writes", "");
    const e = await connectSocketAsync(U.editor.token);
    e.socket.emit("doc:join", { docId });
    await wait(700);
    e.socket.emit("op:submit", { docId, revision: 0, op: { type: "insert", pos: 0, text: "yes", site: "ed2" } });
    await wait(900);

    assert.equal(e.acks.length, 1);
    assert.deepEqual(e.errors, []);
    const after = await req("GET", `/api/documents/${docId}`, U.owner.token);
    assert.equal(after.body.content, "yes");
    e.socket.close();
  });
});

// ─── 5. Approval flow and live revocation ────────────────────────────────────

describe("approval flow", () => {
  test("approving pushes the requester in over their personal room", async () => {
    const created = await req("POST", "/api/documents", U.owner.token, { title: "Live Approve", content: "x" });
    const docId = created.body._id ?? created.body.id;
    const share = await req("POST", `/api/documents/${docId}/share`, U.owner.token);

    // The requester is connected and waiting, not polling.
    const s = await connectSocketAsync(U.stranger.token);

    await req("POST", `/api/documents/join/${share.body.shareToken}`, U.stranger.token, { requestedRole: "editor" });
    const list = await req("GET", `/api/documents/${docId}/requests`, U.owner.token);
    const pending = list.body.requests.find((r) => String(r.userId) === String(U.stranger.id));
    assert.ok(pending, "the request reached the owner's queue");

    expectOk(
      await req("POST", `/api/documents/${docId}/requests/${pending.id}/approve`, U.owner.token, { role: "editor" }),
      "approve"
    );
    await wait(1500);

    assert.equal(s.granted.length, 1, "access:granted arrived without a refresh");
    assert.equal(String(s.granted[0].docId), String(docId));
    assert.equal(s.granted[0].role, "editor");

    // And the grant is real.
    assert.equal((await req("GET", `/api/documents/${docId}`, U.stranger.token)).status, 200);
    s.socket.close();
  });

  test("an approved-then-removed collaborator is cut off mid-session", async () => {
    const { docId } = await seedDocument("Revoke Live", "content");

    const e = await connectSocketAsync(U.editor.token);
    e.socket.emit("doc:join", { docId });
    await wait(900);
    assert.equal(e.loads.length, 1, "joined fine");

    // The per-socket access cache would otherwise keep serving the stale grant.
    await req("DELETE", `/api/documents/${docId}/collaborators/${U.editor.id}`, U.owner.token);
    await wait(1200);

    assert.equal(e.errors.at(-1)?.code, "ACCESS_REVOKED", "the open socket is told");

    // A write attempted after removal must fail, not ride the cached grant.
    e.socket.emit("op:submit", { docId, revision: e.loads[0].revision, op: { type: "insert", pos: 0, text: "nope", site: "ex" } });
    await wait(1000);

    const after = await req("GET", `/api/documents/${docId}`, U.owner.token);
    assert.equal(after.body.content, "content", "no write landed after removal");
    assert.equal((await req("GET", `/api/documents/${docId}`, U.editor.token)).status, 403);
    e.socket.close();
  });

  test("downgrading to viewer takes effect on the open socket", async () => {
    const { docId } = await seedDocument("Downgrade", "base");

    const e = await connectSocketAsync(U.editor.token);
    e.socket.emit("doc:join", { docId });
    await wait(900);

    await req("PATCH", `/api/documents/${docId}/collaborators/${U.editor.id}`, U.owner.token, { role: "viewer" });
    await wait(1200);

    e.socket.emit("op:submit", { docId, revision: e.loads[0].revision, op: { type: "insert", pos: 0, text: "still?", site: "dg" } });
    await wait(1000);

    const after = await req("GET", `/api/documents/${docId}`, U.owner.token);
    assert.equal(after.body.content, "base", "the downgrade bit immediately");
    e.socket.close();
  });

  test("denying leaves the requester without access", async () => {
    const created = await req("POST", "/api/documents", U.owner.token, { title: "Deny", content: "x" });
    const docId = created.body._id ?? created.body.id;
    const share = await req("POST", `/api/documents/${docId}/share`, U.owner.token);

    expectOk(await req("POST", `/api/documents/join/${share.body.shareToken}`, U.stranger.token, {}), "request access");
    const list = expectOk(await req("GET", `/api/documents/${docId}/requests`, U.owner.token), "list requests");
    const pending = list.requests.find((r) => String(r.userId) === String(U.stranger.id));
    assert.ok(pending, `no pending request: ${JSON.stringify(list.requests)}`);

    expectOk(await req("POST", `/api/documents/${docId}/requests/${pending.id}/deny`, U.owner.token, {}), "deny");

    assert.equal((await req("GET", `/api/documents/${docId}`, U.stranger.token)).status, 403);
    const remaining = await req("GET", `/api/documents/${docId}/requests`, U.owner.token);
    assert.equal(remaining.body.requests.length, 0, "the request leaves the queue");
  });
});
