/**
 * server/test/labels.test.js
 * ─────────────────────────────────────────────────────────────────────────────
 * Document labels, against the real server on the LOCAL stack.
 *
 * The rules under test:
 *
 *   - Labels are SHARED document metadata, not per-user. Everyone with access
 *     sees the same set, which is what makes writing them an edit rather than
 *     personal organisation.
 *   - Therefore the OWNER and EDITORS may write them; a VIEWER may not, and is
 *     refused by assertWriteAccess — the same helper that refuses their
 *     keystrokes — with 403 VIEWER_READONLY.
 *   - Filtering by label narrows the caller's own accessible set and never
 *     widens it. A label is not a way to reach a document you cannot open.
 *   - Writes are normalised (trimmed, collapsed, lowercased, de-duplicated,
 *     capped), so the filter can be an exact index match.
 */

require("dotenv").config();
require("dotenv").config({ path: `${__dirname}/../.env.local`, override: true });

const { test, describe, before, after } = require("node:test");
const assert = require("node:assert/strict");
const { spawn } = require("node:child_process");
const http = require("node:http");
const path = require("node:path");

const PORT = 4116;
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
    name, email: `p12-${key}-${Date.now()}-${Math.random().toString(36).slice(2)}@example.invalid`,
    password: "labelsPass1234",
  });
  const me = await req("GET", "/api/auth/me", res.body.token);
  U[key] = { token: res.body.token, id: me.body.id, name };
}

const docId = (d) => d._id ?? d.id;

async function makeDoc(who, title) {
  const res = await req("POST", "/api/documents", U[who].token, { title });
  return docId(res.body);
}

const setLabels = (who, id, labels) =>
  req("PUT", `/api/documents/${id}/labels`, U[who].token, { labels });

const listDocs = (who, query = "") => req("GET", `/api/documents${query}`, U[who].token);

/** Share `id` with `who` at `role`, through the real approval flow. */
async function share(id, who, role) {
  const s = await req("POST", `/api/documents/${id}/share`, U.owner.token);
  await req("POST", `/api/documents/join/${s.body.shareToken}`, U[who].token, { requestedRole: role });
  const list = await req("GET", `/api/documents/${id}/requests`, U.owner.token);
  const pending = list.body.requests.find((r) => String(r.userId) === String(U[who].id));
  await req("POST", `/api/documents/${id}/requests/${pending.id}/approve`, U.owner.token, { role });
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
  await register("editor", "Editor Eddie");
  await register("viewer", "Viewer Vic");
  await register("stranger", "Stranger Sam");
}, { timeout: 45_000 });

after(async () => {
  for (const u of Object.values(U)) await req("DELETE", "/api/auth/me", u.token).catch(() => {});
  if (server && !server.killed) server.kill("SIGKILL");
  await wait(200);
});

// ─── Who may label ───────────────────────────────────────────────────────────

describe("who may label a document", () => {
  test("the owner can set labels", async () => {
    const id = await makeDoc("owner", "Owner labels");
    const res = await setLabels("owner", id, ["urgent", "draft"]);
    assert.equal(res.status, 200);
    assert.deepEqual(res.body.labels, ["urgent", "draft"]);
  });

  test("an editor can set labels", async () => {
    // The point of shared labels: a collaborator who can change the document
    // can also change how it is filed for everyone.
    const id = await makeDoc("owner", "Editor labels");
    await share(id, "editor", "editor");

    const res = await setLabels("editor", id, ["review"]);
    assert.equal(res.status, 200, "an editor may write shared metadata");
    assert.deepEqual(res.body.labels, ["review"]);
  });

  test("a viewer cannot set labels", async () => {
    // The rule this phase turns on. Labels are shared, so writing one changes
    // what other people see — which is precisely what a viewer may not do.
    const id = await makeDoc("owner", "Viewer blocked");
    await setLabels("owner", id, ["original"]);
    await share(id, "viewer", "viewer");

    const res = await setLabels("viewer", id, ["sneaky"]);
    assert.equal(res.status, 403, "a viewer must be refused");
    assert.equal(res.body.code, "VIEWER_READONLY",
      "refused by the same helper that refuses their keystrokes");

    // And the refusal is real, not cosmetic.
    const after = await req("GET", `/api/documents/${id}`, U.owner.token);
    assert.deepEqual(after.body.labels, ["original"], "nothing was written");
  });

  test("a stranger cannot set labels, and cannot learn the document exists", async () => {
    const id = await makeDoc("owner", "Stranger blocked");
    const res = await setLabels("stranger", id, ["nope"]);
    assert.ok([403, 404].includes(res.status), `expected 403/404, got ${res.status}`);
  });

  test("labels must be an array", async () => {
    const id = await makeDoc("owner", "Bad payload");
    assert.equal((await setLabels("owner", id, "urgent")).status, 400);
    assert.equal((await setLabels("owner", id, { a: 1 })).status, 400);
  });
});

// ─── Normalisation ───────────────────────────────────────────────────────────

describe("label normalisation", () => {
  test("case and whitespace collapse into one label", async () => {
    const id = await makeDoc("owner", "Normalise me");
    const res = await setLabels("owner", id, ["Urgent", "  URGENT  ", "urgent", "q3   planning"]);
    assert.deepEqual(res.body.labels, ["urgent", "q3 planning"],
      "duplicates that differ only by case or spacing must collapse");
  });

  test("the per-document count is capped", async () => {
    const id = await makeDoc("owner", "Too many");
    const res = await setLabels("owner", id, Array.from({ length: 25 }, (_, i) => `label-${i}`));
    assert.equal(res.body.labels.length, 10, "a document cannot become a tag dump");
  });

  test("empty and whitespace-only labels are dropped", async () => {
    const id = await makeDoc("owner", "Empties");
    const res = await setLabels("owner", id, ["", "   ", "real"]);
    assert.deepEqual(res.body.labels, ["real"]);
  });

  test("labels can be cleared", async () => {
    const id = await makeDoc("owner", "Clear me");
    await setLabels("owner", id, ["temp"]);
    const res = await setLabels("owner", id, []);
    assert.deepEqual(res.body.labels, [], "an empty array is a valid state, not a no-op");
  });
});

// ─── Filtering ───────────────────────────────────────────────────────────────

describe("filtering by label", () => {
  test("returns only documents carrying that label", async () => {
    const tagged = await makeDoc("owner", "Tagged doc");
    await makeDoc("owner", "Untagged doc");
    await setLabels("owner", tagged, ["filterme"]);

    const res = await listDocs("owner", "?label=filterme");
    assert.equal(res.status, 200);
    const titles = res.body.documents.map((d) => d.title);
    assert.ok(titles.includes("Tagged doc"));
    assert.ok(!titles.includes("Untagged doc"));
  });

  test("the filter is case-insensitive, matching how labels are stored", async () => {
    const id = await makeDoc("owner", "Case doc");
    await setLabels("owner", id, ["MixedCase"]);

    const res = await listDocs("owner", "?label=MIXEDCASE");
    assert.ok(res.body.documents.map((d) => d.title).includes("Case doc"),
      "a filter typed in any case must match the stored label");
  });

  test("omitting the parameter returns labelled and unlabelled alike", async () => {
    const id = await makeDoc("owner", "Both labelled");
    await makeDoc("owner", "Both unlabelled");
    await setLabels("owner", id, ["both"]);

    const titles = (await listDocs("owner")).body.documents.map((d) => d.title);
    assert.ok(titles.includes("Both labelled"));
    assert.ok(titles.includes("Both unlabelled"));
  });

  test("an unusable label is a 400, not a 500", async () => {
    assert.equal((await listDocs("owner", "?label=%20%20")).status, 400);
  });

  test("filtering never widens what the caller can see", async () => {
    // The security half. `stranger` knows the label — labels are shared and
    // guessable — but has no access to the document carrying it.
    const id = await makeDoc("owner", "Private but labelled");
    await setLabels("owner", id, ["sharedword"]);

    const res = await listDocs("stranger", "?label=sharedword");
    assert.equal(res.status, 200, "an empty result, not an error");
    assert.deepEqual(
      res.body.documents.map((d) => d.title), [],
      "a label must not reach a document the caller cannot open"
    );
  });

  test("a collaborator can filter the documents shared with them", async () => {
    // Exercises the $or branch that has no dedicated index and applies the
    // label as a residual filter — the behaviour must be identical.
    const id = await makeDoc("owner", "Shared and labelled");
    await setLabels("owner", id, ["sharedlabel"]);
    await share(id, "editor", "editor");

    const titles = (await listDocs("editor", "?label=sharedlabel")).body.documents.map((d) => d.title);
    assert.ok(titles.includes("Shared and labelled"),
      "the collaborator branch must filter the same way the owner branch does");
  });
});

// ─── Labels in use ───────────────────────────────────────────────────────────

describe("labels in use", () => {
  test("lists labels from the caller's own documents", async () => {
    const id = await makeDoc("owner", "In use doc");
    await setLabels("owner", id, ["inuseone", "inusetwo"]);

    const res = await req("GET", "/api/documents/labels/in-use", U.owner.token);
    assert.equal(res.status, 200);
    assert.ok(res.body.labels.includes("inuseone"));
    assert.ok(res.body.labels.includes("inusetwo"));
  });

  test("does not expose labels from documents the caller cannot see", async () => {
    const id = await makeDoc("owner", "Secret labelled");
    await setLabels("owner", id, ["ownersecretlabel"]);

    const res = await req("GET", "/api/documents/labels/in-use", U.stranger.token);
    assert.equal(res.status, 200);
    assert.ok(
      !res.body.labels.includes("ownersecretlabel"),
      "the label vocabulary is scoped to what the caller can already open"
    );
  });
});
