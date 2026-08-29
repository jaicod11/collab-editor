/**
 * server/test/notifications.test.js
 * ─────────────────────────────────────────────────────────────────────────────
 * The notification system, against the real server on the LOCAL stack.
 *
 * Two things are being pinned:
 *
 *  1. SCOPING. A notification belongs to exactly one person. Every query in
 *     notificationController puts `userId: req.user.id` in the FILTER rather
 *     than checking it after the fetch, and these tests assert the consequence:
 *     no request shape reaches another user's rows, and a foreign id is
 *     indistinguishable from a missing one (both 404), so the endpoint cannot
 *     be used to probe which notifications exist.
 *
 *  2. CREATION. One row per event, of the right type, addressed to the right
 *     person — the requester and the owner are notified about different things
 *     and must not receive each other's.
 */

require("dotenv").config();
require("dotenv").config({ path: `${__dirname}/../.env.local`, override: true });

const { test, describe, before, after } = require("node:test");
const assert = require("node:assert/strict");
const { spawn } = require("node:child_process");
const http = require("node:http");
const path = require("node:path");

const PORT = 4114;
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
    name, email: `p10-${key}-${Date.now()}-${Math.random().toString(36).slice(2)}@example.invalid`,
    password: "notifyPass1234",
  });
  const me = await req("GET", "/api/auth/me", res.body.token);
  U[key] = { token: res.body.token, id: me.body.id, name };
}

/** Every notification currently held by `key`. */
async function inbox(key) {
  const res = await req("GET", "/api/notifications?limit=50", U[key].token);
  return res.body;
}

/** Newest notification of `type` for `key`, or undefined. */
async function newestOfType(key, type) {
  const { notifications } = await inbox(key);
  return notifications.find((n) => n.type === type);
}

/** A document owned by `owner` with a live share token. */
async function seedShared(title = "Notify Doc") {
  const created = await req("POST", "/api/documents", U.owner.token, { title, content: "base" });
  const docId = created.body._id ?? created.body.id;
  const share = await req("POST", `/api/documents/${docId}/share`, U.owner.token);
  return { docId, shareToken: share.body.shareToken };
}

/** Requester follows the link; owner approves or denies. Returns the request id. */
async function requestAccess(docId, shareToken, who, requestedRole = "editor") {
  await req("POST", `/api/documents/join/${shareToken}`, U[who].token, { requestedRole });
  const list = await req("GET", `/api/documents/${docId}/requests`, U.owner.token);
  const pending = list.body.requests.find((r) => String(r.userId) === String(U[who].id));
  return pending?.id;
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
  await register("guest", "Guest Gita");
  await register("other", "Other Omar");
}, { timeout: 45_000 });

after(async () => {
  for (const u of Object.values(U)) await req("DELETE", "/api/auth/me", u.token).catch(() => {});
  if (server && !server.killed) server.kill("SIGKILL");
  await wait(200);
});

// ─── Creation, one event type at a time ──────────────────────────────────────

describe("a notification is written for each event", () => {
  test("access requested → the OWNER is told, the requester is not", async () => {
    const { docId, shareToken } = await seedShared("Requested Doc");
    await requestAccess(docId, shareToken, "guest");

    const owner = await newestOfType("owner", "access_requested");
    assert.ok(owner, "the owner should have an access_requested notification");
    assert.equal(owner.payload.docTitle, "Requested Doc");
    assert.equal(owner.payload.actorName, U.guest.name, "the actor is whoever asked");
    assert.equal(String(owner.payload.docId), String(docId));
    assert.equal(owner.read, false, "a new notification starts unread");

    // The requester already knows they asked.
    assert.equal(
      await newestOfType("guest", "access_requested"), undefined,
      "the requester must not be notified about their own request"
    );
  });

  test("approved → the REQUESTER is told, with the granted role", async () => {
    const { docId, shareToken } = await seedShared("Approved Doc");
    const reqId = await requestAccess(docId, shareToken, "guest", "viewer");
    await req("POST", `/api/documents/${docId}/requests/${reqId}/approve`, U.owner.token, { role: "viewer" });

    const n = await newestOfType("guest", "access_approved");
    assert.ok(n, "the requester should have an access_approved notification");
    assert.equal(n.payload.role, "viewer", "the granted role travels with it");
    assert.equal(n.payload.actorName, U.owner.name);
    assert.equal(n.payload.docTitle, "Approved Doc");
  });

  test("denied → the REQUESTER is told", async () => {
    const { docId, shareToken } = await seedShared("Denied Doc");
    const reqId = await requestAccess(docId, shareToken, "guest");
    await req("POST", `/api/documents/${docId}/requests/${reqId}/deny`, U.owner.token);

    const n = await newestOfType("guest", "access_denied");
    assert.ok(n, "the requester should have an access_denied notification");
    assert.equal(n.payload.docTitle, "Denied Doc");
    assert.equal(n.payload.actorName, U.owner.name);
  });

  test("role changed → the COLLABORATOR is told, with the new role", async () => {
    const { docId, shareToken } = await seedShared("Role Doc");
    const reqId = await requestAccess(docId, shareToken, "guest", "editor");
    await req("POST", `/api/documents/${docId}/requests/${reqId}/approve`, U.owner.token, { role: "editor" });

    const res = await req("PATCH", `/api/documents/${docId}/collaborators/${U.guest.id}`,
      U.owner.token, { role: "viewer" });
    assert.equal(res.status, 200);

    const n = await newestOfType("guest", "role_changed");
    assert.ok(n, "the collaborator should have a role_changed notification");
    assert.equal(n.payload.role, "viewer", "the NEW role, so an upgrade and a downgrade differ");
    assert.equal(n.payload.docTitle, "Role Doc");
  });

  test("access revoked → the REMOVED user is told", async () => {
    const { docId, shareToken } = await seedShared("Revoked Doc");
    const reqId = await requestAccess(docId, shareToken, "guest");
    await req("POST", `/api/documents/${docId}/requests/${reqId}/approve`, U.owner.token, { role: "editor" });

    const res = await req("DELETE", `/api/documents/${docId}/collaborators/${U.guest.id}`, U.owner.token);
    assert.equal(res.status, 200);

    const n = await newestOfType("guest", "access_revoked");
    assert.ok(n, "the removed user should have an access_revoked notification");
    assert.equal(n.payload.docTitle, "Revoked Doc");
    assert.equal(n.payload.actorName, U.owner.name);
  });
});

// ─── Scoping — the security half ─────────────────────────────────────────────

describe("notifications are scoped to the authenticated user", () => {
  test("the list returns only your own rows", async () => {
    const { docId, shareToken } = await seedShared("Scoped Doc");
    await requestAccess(docId, shareToken, "guest");

    const mine = await inbox("owner");
    const theirs = await inbox("other");

    assert.ok(mine.notifications.length > 0, "the owner has notifications to leak");
    assert.equal(
      theirs.notifications.length, 0,
      "an uninvolved user must see none of them"
    );
  });

  test("marking another user's notification read is a 404, not a 403", async () => {
    const { docId, shareToken } = await seedShared("Foreign Doc");
    await requestAccess(docId, shareToken, "guest");

    const target = await newestOfType("owner", "access_requested");
    assert.ok(target, "precondition: the owner has a notification");

    // 404 rather than 403 on purpose: a 403 would confirm the id exists, and
    // the endpoint would become an oracle for other people's notification ids.
    const res = await req("PATCH", `/api/notifications/${target._id}/read`, U.other.token);
    assert.equal(res.status, 404);

    const missing = await req("PATCH", `/api/notifications/${target._id.replace(/.$/, "0")}/read`, U.other.token);
    assert.equal(missing.status, 404, "a nonexistent id is indistinguishable from a foreign one");

    // And it really did not mutate.
    const after = await newestOfType("owner", "access_requested");
    assert.equal(after.read, false, "the foreign PATCH must not have marked it read");
  });

  test("read-all only touches your own rows", async () => {
    const { docId, shareToken } = await seedShared("ReadAll Doc");
    await requestAccess(docId, shareToken, "guest");

    const before = await inbox("owner");
    assert.ok(before.unreadCount > 0, "precondition: the owner has unread notifications");

    const res = await req("POST", "/api/notifications/read-all", U.other.token);
    assert.equal(res.status, 200);
    assert.equal(res.body.marked, 0, "the other user had nothing of their own to mark");

    const after = await inbox("owner");
    assert.equal(
      after.unreadCount, before.unreadCount,
      "another user's read-all must not clear the owner's badge"
    );
  });

  test("a malformed id is rejected without a 500", async () => {
    const res = await req("PATCH", "/api/notifications/not-an-object-id/read", U.owner.token);
    assert.equal(res.status, 404, "a CastError must not surface as a server error");
  });

  test("every endpoint requires authentication", async () => {
    for (const [method, url] of [
      ["GET", "/api/notifications"],
      ["POST", "/api/notifications/read-all"],
      ["PATCH", "/api/notifications/000000000000000000000000/read"],
    ]) {
      const res = await req(method, url, null);
      assert.equal(res.status, 401, `${method} ${url} should be 401 without a token`);
    }
  });
});

// ─── Read state and retention ────────────────────────────────────────────────

describe("read state", () => {
  test("marking one read decrements the unread count", async () => {
    const { docId, shareToken } = await seedShared("Unread Doc");
    await requestAccess(docId, shareToken, "guest");

    const before = await inbox("owner");
    const target = before.notifications.find((n) => !n.read);
    assert.ok(target, "precondition: an unread notification exists");

    const res = await req("PATCH", `/api/notifications/${target._id}/read`, U.owner.token);
    assert.equal(res.status, 200);
    assert.equal(res.body.notification.read, true);
    assert.equal(res.body.unreadCount, before.unreadCount - 1);
  });

  test("read-all clears the badge", async () => {
    const { docId, shareToken } = await seedShared("ClearAll Doc");
    await requestAccess(docId, shareToken, "guest");

    await req("POST", "/api/notifications/read-all", U.owner.token);
    const after = await inbox("owner");
    assert.equal(after.unreadCount, 0);
    assert.ok(
      after.notifications.every((n) => n.read),
      "every returned row should be marked read"
    );
  });
});

describe("retention", () => {
  test("deleting a document removes the notifications that link to it", async () => {
    const { docId, shareToken } = await seedShared("Doomed Doc");
    await requestAccess(docId, shareToken, "guest");

    const before = await inbox("owner");
    assert.ok(
      before.notifications.some((n) => String(n.payload.docId) === String(docId)),
      "precondition: a notification points at this document"
    );

    const del = await req("DELETE", `/api/documents/${docId}`, U.owner.token);
    assert.equal(del.status, 200);

    const after = await inbox("owner");
    assert.equal(
      after.notifications.filter((n) => String(n.payload.docId) === String(docId)).length,
      0,
      "a notification linking to a deleted document would lead nowhere, so it goes too"
    );
  });
});
