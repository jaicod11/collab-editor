/**
 * client/test/load-failure.test.js
 * ─────────────────────────────────────────────────────────────────────────────
 * The doc:join failure path.
 *
 * When doc:join throws server-side the client receives doc:error with code
 * LOAD_FAILED and no doc:load. It therefore has no content, no revision and no
 * role — nothing to resynchronise *from*, only a join to retry.
 *
 * The retry needs care that the existing RESYNC_CODES do not. Those arrive from
 * op:submit, so re-joining is a different code path and cannot re-trigger them.
 * LOAD_FAILED arrives from doc:join itself, so an unbounded retry would spin
 * against a server that is already failing. These tests pin the bound, the
 * cleanup, and the budget reset.
 *
 * Structural, like socket-wiring.test.js and for the same reason: the logic
 * lives inside a React hook and the repo has no DOM test environment.
 */

import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const here = path.dirname(fileURLToPath(import.meta.url));
const read = (rel) => readFileSync(path.join(here, "..", rel), "utf8");

const useOT = read("src/hooks/useOT.js");
const editorPage = read("src/pages/EditorPage.jsx");
const editorCore = read("src/components/Editor/EditorCore.jsx");

describe("LOAD_FAILED handling in useOT", () => {
  test("is handled, and not by falling through to the resync branch", () => {
    assert.match(useOT, /code === "LOAD_FAILED"/, "useOT must branch on LOAD_FAILED");

    // If LOAD_FAILED were added to RESYNC_CODES instead, the resync branch would
    // re-join with no bound at all — the loop this whole design avoids.
    const resyncSet = useOT.match(/const RESYNC_CODES = new Set\(\[([^\]]*)\]/);
    assert.ok(resyncSet, "RESYNC_CODES should still exist");
    assert.doesNotMatch(
      resyncSet[1],
      /LOAD_FAILED/,
      "LOAD_FAILED must not be a RESYNC_CODE: that path re-joins unconditionally"
    );
  });

  test("the retry is bounded", () => {
    assert.match(useOT, /MAX_JOIN_RETRIES\s*=\s*(\d+)/, "a retry ceiling must be defined");
    const max = Number(useOT.match(/MAX_JOIN_RETRIES\s*=\s*(\d+)/)[1]);
    assert.ok(max > 0 && max <= 10, `retry ceiling should be small and positive, got ${max}`);

    assert.match(
      useOT,
      /joinAttemptsRef\.current\s*>=\s*MAX_JOIN_RETRIES/,
      "the attempt count must be compared against the ceiling before retrying"
    );
    assert.match(
      useOT,
      /joinAttemptsRef\.current\s*\+=\s*1/,
      "the attempt count must actually increment, or the ceiling is never reached"
    );
  });

  test("the retry is delayed rather than immediate", () => {
    assert.match(
      useOT,
      /joinRetryTimerRef\.current = setTimeout\(/,
      "retrying synchronously would hammer a server that is already failing"
    );
  });

  test("a pending retry is cleared on unmount", () => {
    // The socket is a module-level singleton that outlives the component, so a
    // surviving timer re-joins a document the user has navigated away from.
    const cleanup = useOT.slice(useOT.indexOf('socket.off("op:ack"') - 400);
    assert.match(
      cleanup,
      /clearTimeout\(joinRetryTimerRef\.current\)/,
      "the effect cleanup must clear a pending join retry"
    );
  });

  test("a successful load restores the retry budget", () => {
    // Without this the budget is spent once per mount, so a transient failure
    // an hour into a session would get no retry at all.
    const onDocLoad = useOT.slice(useOT.indexOf("const onDocLoad"));
    assert.match(
      onDocLoad.slice(0, 900),
      /joinAttemptsRef\.current = 0/,
      "doc:load must reset the attempt counter"
    );
  });

  test("exhausting the retries notifies the caller", () => {
    assert.match(useOT, /onLoadFailedRef\.current\?\.\(\)/, "must invoke the onLoadFailed callback");
    assert.match(useOT, /onLoadFailed\b/, "useOT must accept an onLoadFailed prop");
  });
});

describe("LOAD_FAILED wiring through the component tree", () => {
  test("EditorCore forwards onLoadFailed to useOT", () => {
    const otCall = editorCore.slice(editorCore.indexOf("useOT({"));
    assert.match(
      otCall.slice(0, 300),
      /onLoadFailed/,
      "EditorCore must pass onLoadFailed through to the hook"
    );
  });

  test("EditorPage supplies a handler and suppresses the per-retry toast", () => {
    assert.match(editorPage, /onLoadFailed=\{handleLoadFailed\}/, "EditorPage must supply a handler");
    assert.match(
      editorPage,
      /if \(code === "LOAD_FAILED"\) return;/,
      "the generic doc:error toast must skip LOAD_FAILED, or it fires on every retry"
    );
  });
});
