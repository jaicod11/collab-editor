/**
 * server/test/workspaces.test.js
 * ─────────────────────────────────────────────────────────────────────────────
 * Filing documents into workspaces, against the real server on the LOCAL stack.
 *
 * The rule under test: a workspace is a LABEL, never a grant.
 *
 *   - Only the document's OWNER may file it, and only into a workspace they own
 *     or belong to. A collaborator's attempt is a 404, the same answer as a
 *     workspace that does not exist, so the endpoint cannot be used to discover
 *     which workspace ids are real.
 *   - Membership of a workspace confers NO access to the documents in it. The
 *     workspace filter is applied on top of the owner/collaborator scope, so it
 *     can only narrow what the caller could already see. This is the half that
 *     would turn workspaces into a side channel if it were wrong, so it is
 *     tested from the outside: a non-collaborator who is a member of the
 *     workspace must still see nothing.
 *   - Deleting a workspace unfiles its documents rather than deleting them.
 */

require("dotenv").config();
require("dotenv").config({ path: `${__dirname}/../.env.local`, override: true });

const { test, describe, before, after } = require("node:test");
const assert = require("node:assert/strict");
const { spawn } = require("node:child_process");
const http = require("node:http");
const path = require("node:path");
const mongoose = require("mongoose");

const PORT = 4115;
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
    name, email: `p11-${key}-${Date.now()}-${Math.random().toString(36).slice(2)}@example.invalid`,
    password: "workspacePass1234",
  });
  const me = await req("GET", "/api/auth/me", res.body.token);
  U[key] = { token: res.body.token, id: me.body.id, name };
}

const wsId = (w) => w._id ?? w.id;
const docId = (d) => d._id ?? d.id;

async function makeWorkspace(who, name) {
  const res = await req("POST", "/api/workspaces", U[who].token, { name, color: "#22c55e" });
  return wsId(res.body.workspace ?? res.body);
}

async function makeDoc(who, title, workspace) {
  const res = await req("POST", "/api/documents", U[who].token,
    workspace === undefined ? { title } : { title, workspace });
  return res;
}

/** Share `doc` with `who` as an approved collaborator. */
async function addCollaborator(id, who, role = "editor") {
  const share = await req("POST", `/api/documents/${id}/share`, U.owner.token);
  await req("POST", `/api/documents/join/${share.body.shareToken}`, U[who].token, { requestedRole: role });
  const list = await req("GET", `/api/documents/${id}/requests`, U.owner.token);
  const pending = list.body.requests.find((r) => String(r.userId) === String(U[who].id));
  await req("POST", `/api/documents/${id}/requests/${pending.id}/approve`, U.owner.token, { role });
}

async function listDocs(who, query = "") {
  const res = await req("GET", `/api/documents${query}`, U[who].token);
  return res;
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
  await register("collab", "Collab Cass");
  await register("stranger", "Stranger Sam");
}, { timeout: 45_000 });

after(async () => {
  for (const u of Object.values(U)) await req("DELETE", "/api/auth/me", u.token).catch(() => {});
  if (server && !server.killed) server.kill("SIGKILL");
  await wait(200);
});

// ─── Filing and filtering ────────────────────────────────────────────────────

describe("filtering by workspace", () => {
  test("a document can be created into a workspace, and filtered to it", async () => {
    const ws = await makeWorkspace("owner", "Filter WS");
    const filed = await makeDoc("owner", "Filed doc", ws);
    await makeDoc("owner", "Unfiled doc");

    assert.equal(filed.status, 201);

    const inWs = await listDocs("owner", `?workspace=${ws}`);
    assert.equal(inWs.status, 200);
    const titles = inWs.body.documents.map((d) => d.title);
    assert.ok(titles.includes("Filed doc"), "the filed document should be in its workspace");
    assert.ok(!titles.includes("Unfiled doc"), "an unfiled document must not appear in a workspace");
  });

  test("the unfiled view returns documents with no workspace", async () => {
    const ws = await makeWorkspace("owner", "Unfiled WS");
    await makeDoc("owner", "Filed elsewhere", ws);
    await makeDoc("owner", "Genuinely unfiled");

    const res = await listDocs("owner", "?workspace=unfiled");
    assert.equal(res.status, 200);
    const titles = res.body.documents.map((d) => d.title);
    assert.ok(titles.includes("Genuinely unfiled"));
    assert.ok(!titles.includes("Filed elsewhere"));
    assert.ok(
      res.body.documents.every((d) => d.workspace === null),
      "every row in the unfiled view should have a null workspace"
    );
  });

  test("omitting the parameter returns filed and unfiled alike", async () => {
    const ws = await makeWorkspace("owner", "Both WS");
    await makeDoc("owner", "Both filed", ws);
    await makeDoc("owner", "Both unfiled");

    const titles = (await listDocs("owner")).body.documents.map((d) => d.title);
    assert.ok(titles.includes("Both filed"));
    assert.ok(titles.includes("Both unfiled"));
  });

  test("a malformed workspace id is a 400, not a 500", async () => {
    const res = await listDocs("owner", "?workspace=not-an-object-id");
    assert.equal(res.status, 400);
  });

  test("a document can be moved between workspaces and back out", async () => {
    const a = await makeWorkspace("owner", "WS A");
    const b = await makeWorkspace("owner", "WS B");
    const doc = await makeDoc("owner", "Movable", a);
    const id = docId(doc.body);

    await req("PATCH", `/api/documents/${id}`, U.owner.token, { workspace: b });
    let titles = (await listDocs("owner", `?workspace=${b}`)).body.documents.map((d) => d.title);
    assert.ok(titles.includes("Movable"), "should have moved to B");

    titles = (await listDocs("owner", `?workspace=${a}`)).body.documents.map((d) => d.title);
    assert.ok(!titles.includes("Movable"), "and left A");

    // null unfiles it — "no workspace" stays a reachable state.
    await req("PATCH", `/api/documents/${id}`, U.owner.token, { workspace: null });
    titles = (await listDocs("owner", "?workspace=unfiled")).body.documents.map((d) => d.title);
    assert.ok(titles.includes("Movable"), "should be unfiled again");
  });
});

// ─── Authorisation — the security half ───────────────────────────────────────

describe("who may file a document", () => {
  test("a collaborator cannot file someone else's document", async () => {
    const ws = await makeWorkspace("collab", "Collab's WS");
    const doc = await makeDoc("owner", "Owned by Olga");
    const id = docId(doc.body);
    await addCollaborator(id, "collab", "editor");

    const res = await req("PATCH", `/api/documents/${id}`, U.collab.token, { workspace: ws });
    assert.equal(res.status, 404, "an editor is still not the owner");

    const check = await req("GET", `/api/documents/${id}`, U.owner.token);
    assert.equal(check.body.workspace, null, "and the document must be unchanged");
  });

  test("the owner cannot file into a workspace they do not belong to", async () => {
    const foreign = await makeWorkspace("stranger", "Stranger's WS");
    const doc = await makeDoc("owner", "Mine to file");
    const id = docId(doc.body);

    const res = await req("PATCH", `/api/documents/${id}`, U.owner.token, { workspace: foreign });
    assert.equal(res.status, 404);

    // Same answer for an id that does not exist at all: the response must not
    // reveal whether a given workspace is real.
    const nonexistent = await req("PATCH", `/api/documents/${id}`, U.owner.token,
      { workspace: "000000000000000000000000" });
    assert.equal(nonexistent.status, 404);
    assert.deepEqual(res.body, nonexistent.body, "the two must be indistinguishable");
  });

  test("creating a document into a foreign workspace is refused", async () => {
    const foreign = await makeWorkspace("stranger", "Stranger's Create WS");
    const res = await makeDoc("owner", "Should not be created", foreign);
    assert.equal(res.status, 404);
  });

  test("a workspace is not a side channel: membership grants no document access", async () => {
    // The strongest form of the rule. `collab` is a MEMBER of the workspace but
    // NOT a collaborator on the document filed into it.
    //
    // The membership is written straight to the database because there is no
    // endpoint that adds a member — workspaceController.update accepts only
    // name and color. Going through the API would have left `collab` a
    // non-member and this test would have passed without ever exercising the
    // property it names.
    const shared = await makeWorkspace("owner", "Shared WS");
    await mongoose.connect(process.env.MONGODB_URI);
    const updated = await mongoose.connection.db.collection("workspaces").updateOne(
      { _id: new mongoose.Types.ObjectId(shared) },
      { $addToSet: { members: new mongoose.Types.ObjectId(U.collab.id) } }
    );
    assert.equal(updated.modifiedCount, 1, "precondition: collab must really be a member");
    const check = await mongoose.connection.db.collection("workspaces")
      .findOne({ _id: new mongoose.Types.ObjectId(shared) });
    assert.ok(
      check.members.some((m) => String(m) === String(U.collab.id)),
      "precondition: membership must be readable back"
    );
    await mongoose.disconnect();

    const doc = await makeDoc("owner", "Secret in a shared workspace", shared);
    const id = docId(doc.body);

    // Not visible in an unfiltered list…
    const all = (await listDocs("collab")).body.documents.map((d) => d.title);
    assert.ok(!all.includes("Secret in a shared workspace"), "must not appear in their document list");

    // …nor by filtering on the very workspace they belong to…
    const filtered = await listDocs("collab", `?workspace=${shared}`);
    assert.equal(filtered.status, 200);
    assert.ok(
      !filtered.body.documents.map((d) => d.title).includes("Secret in a shared workspace"),
      "filtering by a workspace must not widen what the caller can see"
    );

    // …nor by fetching it directly.
    const direct = await req("GET", `/api/documents/${id}`, U.collab.token);
    assert.equal(direct.status, 403, "workspace membership is not document access");
  });
});

// ─── Workspace deletion ──────────────────────────────────────────────────────

describe("deleting a workspace", () => {
  test("unfiles its documents instead of deleting them", async () => {
    const ws = await makeWorkspace("owner", "Doomed WS");
    const a = await makeDoc("owner", "Survivor A", ws);
    const b = await makeDoc("owner", "Survivor B", ws);

    const del = await req("DELETE", `/api/workspaces/${ws}`, U.owner.token);
    assert.equal(del.status, 200);
    assert.equal(del.body.unfiled, 2, "both documents should have been unfiled");

    // The documents still exist…
    for (const created of [a, b]) {
      const res = await req("GET", `/api/documents/${docId(created.body)}`, U.owner.token);
      assert.equal(res.status, 200, "deleting a workspace must not delete its documents");
      assert.equal(res.body.workspace, null, "and must not leave a dangling reference");
    }

    // …and show up in the unfiled view.
    const titles = (await listDocs("owner", "?workspace=unfiled")).body.documents.map((d) => d.title);
    assert.ok(titles.includes("Survivor A") && titles.includes("Survivor B"));
  });

  test("only the workspace owner can delete it", async () => {
    const ws = await makeWorkspace("owner", "Not Yours WS");
    const res = await req("DELETE", `/api/workspaces/${ws}`, U.stranger.token);
    assert.equal(res.status, 404);
  });
});
