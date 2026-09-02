/**
 * client/test/labels.test.js
 * ─────────────────────────────────────────────────────────────────────────────
 * Guards for the label UI.
 *
 * Phase 6 deleted a TAG column that guessed a category from substrings of the
 * document title, via five copies of an inferCategory() helper whose fallbacks
 * disagreed — so the same document showed a different category depending on
 * which page you were looking at. These assertions pin the two properties that
 * failure taught: labels are never derived from a title, and there is exactly
 * one component rendering them.
 *
 * Structural, like socket-wiring.test.js and load-failure.test.js, and for the
 * same reason: this logic lives in React components and the repo has no DOM
 * test environment.
 */

import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const here = path.dirname(fileURLToPath(import.meta.url));
const srcDir = path.join(here, "..", "src");
const read = (rel) => readFileSync(path.join(here, "..", rel), "utf8");

/** Every .jsx/.js file under client/src. */
function sourceFiles(dir = srcDir, acc = []) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) sourceFiles(full, acc);
    else if (/\.(jsx?|mjs)$/.test(entry.name)) acc.push(full);
  }
  return acc;
}

describe("labels are stored, never inferred", () => {
  test("no inferCategory() helper has come back", () => {
    const offenders = sourceFiles()
      .filter((f) => /function\s+inferCategory|const\s+inferCategory/.test(readFileSync(f, "utf8")))
      .map((f) => path.relative(srcDir, f));

    assert.deepEqual(offenders, [],
      "a category must never be guessed from a title again: " + offenders.join(", "));
  });

  test("nothing derives a label from the document title", () => {
    // The specific shape of the old bug: reading doc.title to decide a tag.
    const offenders = [];
    for (const file of sourceFiles()) {
      const src = readFileSync(file, "utf8");
      if (/\.title[^\n]*\b(includes|match|startsWith|indexOf)\b[^\n]*\b(tag|label|categor)/i.test(src)) {
        offenders.push(path.relative(srcDir, file));
      }
    }
    assert.deepEqual(offenders, [], "labels must come from doc.labels: " + offenders.join(", "));
  });
});

describe("one renderer, not per-page logic", () => {
  test("LabelChips is the only component drawing a label chip", () => {
    // Every page that shows labels must go through the shared component, which
    // is what makes the same document render identically everywhere — the
    // property the five inferCategory copies could not hold.
    const consumers = sourceFiles()
      .filter((f) => /\bdoc\.labels\b|\blabels=\{/.test(readFileSync(f, "utf8")))
      .map((f) => path.relative(srcDir, f));

    for (const rel of consumers) {
      if (rel.endsWith("LabelChips.jsx")) continue;      // the renderer itself
      if (rel.endsWith("useLabels.js")) continue;         // data, renders nothing
      if (rel.endsWith("LabelEditor.jsx")) continue;      // composes LabelChips
      const src = read(path.join("src", rel));
      assert.match(src, /LabelChips/,
        `${rel} shows labels without going through LabelChips`);
    }

    assert.ok(consumers.length >= 3, `expected several consumers, found ${consumers.length}`);
  });

  test("the label filter is sent to the server, not applied after fetch on the list page", () => {
    // The document list is capped at 100 rows server-side, so filtering after
    // the fetch would silently hide matches beyond that cap.
    const hook = read("src/hooks/useDocument.js");
    assert.match(hook, /params\.label\s*=\s*label/,
      "loadDocuments must pass the label to the API");
  });
});

describe("client normalisation matches the server", () => {
  test("the editor lowercases and collapses the same way", () => {
    const editor = read("src/components/UI/LabelEditor.jsx");
    // If these drift, the chips shown after a save differ from what was stored.
    assert.match(editor, /toLowerCase\(\)/, "must lowercase, as the server does");
    assert.match(editor, /replace\(\/\\s\+\/g, " "\)/, "must collapse whitespace, as the server does");
    assert.match(editor, /MAX_LABELS\s*=\s*10/, "cap must mirror Document.MAX_LABELS");
    assert.match(editor, /MAX_LENGTH\s*=\s*32/, "cap must mirror Document.MAX_LABEL_LENGTH");
  });
});
