/**
 * client/test/socket-wiring.test.js
 * ─────────────────────────────────────────────────────────────────────────────
 * Source-level guards for the socket-listener lifecycle.
 *
 * The socket is a module-level singleton that outlives every component, so a
 * listener the cleanup cannot remove leaks for the lifetime of the tab. That is
 * exactly what happened: useSocket registered an ANONYMOUS "connect" handler
 * alongside a named one, cleanup could only remove the named one, and each
 * navigation into the editor left another live handler behind. StrictMode
 * doubled it. After N visits a single reconnect fired N doc:join emits.
 *
 * These assertions are structural rather than behavioural because the logic
 * lives inside React hooks and the repo has no DOM test environment. They pin
 * the specific shape that regressed; the behavioural half is covered by
 * server/test/presence.test.js ("exactly one doc:load per doc:join").
 */

import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const here = path.dirname(fileURLToPath(import.meta.url));
const read = (rel) => readFileSync(path.join(here, "..", rel), "utf8");

/** Every `socket.on("evt", handler)` in a source file. */
function registrations(src) {
  return [...src.matchAll(/\b\w*\.?on\(\s*"([^"]+)"\s*,\s*([^)]*)/g)]
    .map((m) => ({ event: m[1], handler: m[2].trim() }));
}
function removals(src) {
  return [...src.matchAll(/\b\w*\.?off\(\s*"([^"]+)"\s*,\s*(\w+)/g)]
    .map((m) => ({ event: m[1], handler: m[2] }));
}

const HOOKS = ["src/hooks/useSocket.js", "src/hooks/useOT.js", "src/hooks/usePresence.js"];

describe("socket listeners are all removable", () => {
  for (const file of HOOKS) {
    test(`${file} registers no anonymous handlers`, () => {
      const src = read(file);
      const anonymous = registrations(src).filter(
        (r) => r.handler.startsWith("(") || r.handler.startsWith("function") || r.handler.includes("=>")
      );
      assert.deepEqual(
        anonymous, [],
        `anonymous handlers cannot be passed to socket.off() and leak on every mount: ` +
        JSON.stringify(anonymous)
      );
    });

    test(`${file} removes every listener it registers`, () => {
      const src = read(file);
      const on = registrations(src);
      const off = removals(src);
      for (const r of on) {
        const match = off.find((o) => o.event === r.event && o.handler === r.handler);
        assert.ok(
          match,
          `"${r.event}" is registered with ${r.handler} but never removed with the same binding`
        );
      }
    });
  }
});

describe("useSocket emits doc:join exactly once per join", () => {
  const src = read("src/hooks/useSocket.js");

  test("there is a single doc:join emit site", () => {
    const emits = [...src.matchAll(/emit\(\s*"doc:join"/g)];
    assert.equal(
      emits.length, 1,
      `doc:join must be emitted from one place; found ${emits.length}. ` +
      `The old version had three, so a single mount joined the room three times.`
    );
  });

  test("the emit is guarded so a mount cannot join twice", () => {
    assert.match(src, /joined\s*=\s*true/, "a per-effect guard flag is set");
    assert.match(src, /if\s*\(joined\)\s*return/, "the guard short-circuits a repeat join");
  });

  test("a reconnect clears the guard so the room is rejoined", () => {
    // Room membership does not survive a dropped socket, so `connect` must
    // re-join — otherwise a reconnected client silently stops receiving ops.
    const onConnect = src.slice(src.indexOf("const onConnect"), src.indexOf("const onDisconnect"));
    assert.match(onConnect, /joined\s*=\s*false/, "connect resets the guard");
    assert.match(onConnect, /join\(\)/, "connect re-joins");
  });

  test("doc:leave is only emitted if we actually joined", () => {
    const cleanup = src.slice(src.indexOf("return () => {"));
    assert.match(cleanup, /if\s*\(joined\)\s*s\.emit\(\s*"doc:leave"/);
  });
});

describe("useOT keeps the editor usable after a remote write", () => {
  const src = read("src/hooks/useOT.js");

  test("the isApplyingRemote mutex is cleared in a finally block", () => {
    // A throw between setting and clearing used to latch the mutex on, which
    // makes handleEditorInput return early forever — a read-only editor.
    assert.match(src, /finally\s*\{[^}]*isApplyingRemote\.current\s*=\s*false/s);
  });

  test("caret position is captured and restored around DOM writes", () => {
    assert.match(src, /readCaretOffset/, "caret offset is read before the write");
    assert.match(src, /writeCaretOffset/, "caret offset is restored after it");
  });
});
