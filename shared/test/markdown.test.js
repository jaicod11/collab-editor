/**
 * shared/test/markdown.test.js
 * ─────────────────────────────────────────────────────────────────────────────
 * The toolbar's marker logic, tested as text transforms and — crucially —
 * through the OP STREAM rather than the DOM.
 *
 * Formatting has to be characters, not attributes: the OT engine transforms
 * operations over a flat string, so anything that is not in the text cannot
 * survive a concurrent edit. These tests assert that every toolbar action
 * produces the same kind of operation that typing produces, so it syncs by the
 * same mechanism with no special handling anywhere.
 */

import { test, describe } from "node:test";
import assert from "node:assert/strict";
import {
  toggleWrap, toggleLinePrefix, toggleOrderedList, toggleCodeBlock,
  insertLink, continueListOnEnter,
} from "../ot/markdown.js";
import { diffToOp } from "../ot/diff.js";
import { applyOp, applyOps, transform } from "../ot/operations.js";

const applyDiff = (text, op) =>
  op == null ? text : Array.isArray(op) ? applyOps(text, op) : applyOp(text, op);

/** Run a toolbar action and return both the result and the ops it generates. */
function throughOps(before, action) {
  const result = action(before);
  const op = diffToOp(before, result.text);
  return { result, op, applied: applyDiff(before, op) };
}

describe("inline wrapping", () => {
  test("bold wraps the selection", () => {
    const r = toggleWrap("hello world", 6, 11, "**");
    assert.equal(r.text, "hello **world**");
    assert.equal(r.text.slice(r.selectionStart, r.selectionEnd), "world", "selection is preserved");
  });

  test("bold toggles OFF instead of stacking", () => {
    // The selection covers the markers.
    const off = toggleWrap("hello **world**", 6, 15, "**");
    assert.equal(off.text, "hello world");
    assert.equal(off.text.slice(off.selectionStart, off.selectionEnd), "world");
  });

  test("bold toggles off when only the inner text is selected", () => {
    // "**world**" with just `world` highlighted — the common case.
    const off = toggleWrap("hello **world**", 8, 13, "**");
    assert.equal(off.text, "hello world");
    assert.equal(off.text.slice(off.selectionStart, off.selectionEnd), "world");
  });

  test("applying bold twice is a no-op round trip", () => {
    const on = toggleWrap("abc", 0, 3, "**");
    const off = toggleWrap(on.text, on.selectionStart, on.selectionEnd, "**");
    assert.equal(off.text, "abc", "**** must never accumulate");
  });

  test("an empty selection puts the caret between the markers", () => {
    const r = toggleWrap("ab", 1, 1, "**");
    assert.equal(r.text, "a****b");
    assert.equal(r.selectionStart, 3);
    assert.equal(r.selectionEnd, 3, "caret sits between the markers, ready to type");
  });

  test("italic, strikethrough and inline code use their own markers", () => {
    assert.equal(toggleWrap("x", 0, 1, "_").text, "_x_");
    assert.equal(toggleWrap("x", 0, 1, "~~").text, "~~x~~");
    assert.equal(toggleWrap("x", 0, 1, "`").text, "`x`");
  });

  test("italic inside bold nests instead of eating a bold marker", () => {
    // Why italic is "_" and not "*": with "*", the characters either side of
    // the selection in "**bold**" look like italic markers, so the toggle
    // unwraps one layer of the BOLD instead of adding emphasis.
    const withUnderscore = toggleWrap("**bold**", 2, 6, "_");
    assert.equal(withUnderscore.text, "**_bold_**");

    const withAsterisk = toggleWrap("**bold**", 2, 6, "*");
    assert.equal(withAsterisk.text, "*bold*", "the ambiguity this avoids");
  });
});

describe("line prefixes", () => {
  test("heading applies to the caret's line", () => {
    const r = toggleLinePrefix("one\ntwo\nthree", 5, 5, "# ");
    assert.equal(r.text, "one\n# two\nthree");
  });

  test("heading toggles off", () => {
    const r = toggleLinePrefix("# one", 2, 2, "# ");
    assert.equal(r.text, "one");
  });

  test("heading levels replace each other rather than stacking", () => {
    const r = toggleLinePrefix("# one", 2, 2, "## ", { replaces: ["# ", "### "] });
    assert.equal(r.text, "## one", "must not become '# ## one'");
  });

  test("a multi-line selection gets the prefix on every line", () => {
    const r = toggleLinePrefix("a\nb\nc", 0, 5, "> ");
    assert.equal(r.text, "> a\n> b\n> c");
  });

  test("partial coverage normalises to one level rather than stacking", () => {
    // "> > a" is a NESTED quote, which is never what a toolbar button should
    // produce from a mixed selection. Lines that already have the prefix keep
    // exactly one.
    const mixed = toggleLinePrefix("> a\nb", 0, 5, "> ");
    assert.equal(mixed.text, "> a\n> b");

    const all = toggleLinePrefix("> a\n> b", 0, 7, "> ");
    assert.equal(all.text, "a\nb", "full coverage toggles off");
  });

  test("bullets apply per line", () => {
    const r = toggleLinePrefix("a\nb", 0, 3, "- ");
    assert.equal(r.text, "- a\n- b");
  });
});

describe("ordered lists", () => {
  test("numbers the selected lines from one", () => {
    const r = toggleOrderedList("a\nb\nc", 0, 5);
    assert.equal(r.text, "1. a\n2. b\n3. c");
  });

  test("toggles numbering off", () => {
    const r = toggleOrderedList("1. a\n2. b", 0, 9);
    assert.equal(r.text, "a\nb");
  });

  test("renumbers rather than doubling an existing list", () => {
    const r = toggleOrderedList("3. a\n7. b", 0, 9);
    assert.equal(r.text, "a\nb", "already numbered -> toggles off");
  });
});

describe("code blocks and links", () => {
  test("fences the selection on its own lines", () => {
    const r = toggleCodeBlock("const x = 1", 0, 11);
    assert.equal(r.text, "```\nconst x = 1\n```");
    assert.equal(r.text.slice(r.selectionStart, r.selectionEnd), "const x = 1");
  });

  test("unfences a selected code block", () => {
    const on = toggleCodeBlock("x", 0, 1);
    const off = toggleCodeBlock(on.text, 0, on.text.length);
    assert.equal(off.text, "x");
  });

  test("adds surrounding newlines when mid-line", () => {
    const r = toggleCodeBlock("abcdef", 3, 6);
    assert.ok(r.text.startsWith("abc\n```"), r.text);
  });

  test("a link uses the selection as the label and selects the URL slot", () => {
    const r = insertLink("see docs", 4, 8);
    assert.equal(r.text, "see [docs]()");
    assert.equal(r.selectionStart, r.selectionEnd, "caret sits in the empty URL");
    assert.equal(r.text.slice(r.selectionStart - 2, r.selectionStart), "](");
  });

  test("a link with no selection gives placeholder text, selected", () => {
    const r = insertLink("", 0, 0);
    assert.equal(r.text, "[link text]()");
    assert.equal(r.text.slice(r.selectionStart, r.selectionEnd), "link text");
  });
});

describe("list auto-continuation on Enter", () => {
  test("continues a bullet list", () => {
    const r = continueListOnEnter("- one", 5);
    assert.equal(r.text, "- one\n- ");
    assert.equal(r.selectionStart, r.text.length);
  });

  test("continues a numbered list, incrementing", () => {
    const r = continueListOnEnter("1. one", 6);
    assert.equal(r.text, "1. one\n2. ");
  });

  test("continues a blockquote", () => {
    const r = continueListOnEnter("> quoted", 8);
    assert.equal(r.text, "> quoted\n> ");
  });

  test("preserves indentation", () => {
    const r = continueListOnEnter("  - nested", 10);
    assert.equal(r.text, "  - nested\n  - ");
  });

  test("an EMPTY item ends the list instead of adding another", () => {
    const r = continueListOnEnter("- one\n- ", 8);
    assert.equal(r.text, "- one\n", "the empty marker is removed");
    assert.equal(r.selectionStart, 6);
  });

  test("outside a list it defers to a plain newline", () => {
    assert.equal(continueListOnEnter("plain text", 10), null);
    assert.equal(continueListOnEnter("", 0), null);
  });

  test("continuing a list mid-document only touches the current line", () => {
    const r = continueListOnEnter("- a\n- b\nafter", 7);
    assert.equal(r.text, "- a\n- b\n- \nafter");
  });
});

describe("every toolbar action flows through the op stream", () => {
  // This is the point of the whole design: a toolbar action is indistinguishable
  // from typing as far as sync is concerned.
  const cases = [
    ["bold", (t) => toggleWrap(t, 0, 5, "**")],
    ["italic", (t) => toggleWrap(t, 0, 5, "_")],
    ["strikethrough", (t) => toggleWrap(t, 0, 5, "~~")],
    ["inline code", (t) => toggleWrap(t, 0, 5, "`")],
    ["heading", (t) => toggleLinePrefix(t, 0, 0, "# ")],
    ["quote", (t) => toggleLinePrefix(t, 0, 0, "> ")],
    ["bullet", (t) => toggleLinePrefix(t, 0, 0, "- ")],
    ["ordered", (t) => toggleOrderedList(t, 0, 5)],
    ["code block", (t) => toggleCodeBlock(t, 0, 5)],
    ["link", (t) => insertLink(t, 0, 5)],
  ];

  for (const [name, action] of cases) {
    test(`${name} produces ops that reproduce the result exactly`, () => {
      const before = "hello world";
      const { result, op, applied } = throughOps(before, action);
      assert.notEqual(result.text, before, `${name} changed nothing`);
      assert.ok(op, `${name} produced no operation — it would never sync`);
      assert.equal(applied, result.text, `${name}: applying its ops must rebuild the same text`);
    });

    test(`${name} emits only insert/delete ops — no new op type`, () => {
      const { op } = throughOps("hello world", action);
      for (const single of Array.isArray(op) ? op : [op]) {
        assert.ok(["insert", "delete"].includes(single.type), `${name} emitted ${single.type}`);
      }
    });
  }

  test("a toolbar action converges against a concurrent remote edit", () => {
    // A collaborator types at the end while we bold the first word.
    const base = "hello world";
    const bolded = toggleWrap(base, 0, 5, "**");
    const mine = diffToOp(base, bolded.text);
    const theirs = { type: "insert", pos: base.length, text: "!", site: "bravo" };

    const mineOps = (Array.isArray(mine) ? mine : [mine]).map((o) => ({ ...o, site: "alpha" }));
    // Fold both branches through the transform, as the server and client do.
    let doc = base;
    let remote = theirs;
    for (const op of mineOps) {
      const [, remotePrime] = transform(op, remote);
      doc = applyOp(doc, op);
      remote = remotePrime;
    }
    const left = applyOp(doc, remote);

    let other = applyOp(base, theirs);
    let rebased = mineOps;
    let carry = theirs;
    rebased = mineOps.map((op) => {
      const [opPrime, carryPrime] = transform(op, carry);
      carry = carryPrime;
      return opPrime;
    });
    for (const op of rebased) other = applyOp(other, op);

    assert.equal(left, other, "markdown markers converge like any other characters");
    assert.ok(left.includes("**hello**"), left);
  });
});
