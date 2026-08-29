/**
 * server/test/doc-error-codes.test.js
 * ─────────────────────────────────────────────────────────────────────────────
 * Structural guard: every doc:error carries a machine-readable `code`.
 *
 * The client branches on `code` and ignores codes it does not recognise, so a
 * codeless doc:error is silently inert — it shows a toast and nothing else
 * happens. That is exactly what went wrong on the doc:join failure path: the
 * join threw, the client never received doc:load, and because the error had no
 * code neither useOT nor EditorPage could act on it. The user was left looking
 * at an empty editor with no retry and no way forward.
 *
 * These assertions are structural because the failure they pin is a *missing*
 * field on an error path that only fires when the database or cache is broken —
 * far easier to assert about the source than to provoke against a live server.
 */

const { test, describe } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const HANDLER = path.join(__dirname, "..", "src", "socket", "handlers", "documentHandler.js");
const src = fs.readFileSync(HANDLER, "utf8");

/**
 * Every `emit("doc:error", …)` call site, with enough of the following source
 * to see whether a `code` was supplied. Payloads are written both inline and
 * across several lines, so this reads a window rather than a single line.
 */
function docErrorEmits(source) {
  const marker = 'emit("doc:error"';
  const out = [];
  let i = source.indexOf(marker);
  while (i !== -1) {
    const line = source.slice(0, i).split("\n").length;
    out.push({ line, window: source.slice(i, i + 160) });
    i = source.indexOf(marker, i + 1);
  }
  return out;
}

describe("doc:error payloads", () => {
  test("every emit site supplies a code", () => {
    const emits = docErrorEmits(src);

    // Guard the guard: if the emits stop being found, the test must fail loudly
    // rather than passing vacuously over an empty list.
    assert.ok(emits.length >= 10, `expected to find the doc:error emits, found ${emits.length}`);

    const codeless = emits.filter((e) => !/\bcode:\s*"/.test(e.window));
    assert.deepEqual(
      codeless.map((e) => e.line),
      [],
      "doc:error without a code is inert on the client — the listener ignores " +
        "unknown/absent codes. Offending line numbers: " +
        codeless.map((e) => e.line).join(", ")
    );
  });

  test("the doc:join catch reports LOAD_FAILED", () => {
    // Specifically the join path: the client has no document at all when this
    // fires, which is a different situation from an op being rejected, and the
    // client's recovery (retry the join) depends on being told which it is.
    const joinCatch = src.slice(src.indexOf('socket.on("doc:join"'));
    const firstCatch = joinCatch.slice(joinCatch.indexOf("} catch"));

    assert.match(
      firstCatch.slice(0, 600),
      /emit\("doc:error",\s*\{\s*code:\s*"LOAD_FAILED"/,
      "the doc:join catch must emit code LOAD_FAILED so the client can retry the join"
    );
  });
});
