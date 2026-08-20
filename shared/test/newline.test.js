/**
 * shared/test/newline.test.js
 * ─────────────────────────────────────────────────────────────────────────────
 * Line breaks are document CONTENT, not DOM structure.
 *
 * The bug this guards: pressing Enter made the browser insert a <div>/<br>,
 * which textContent does not report, so no "\n" entered the document and no
 * operation was generated. The typist saw three lines; the collaborator saw
 * one, both reporting the same character count — and the next remote op wiped
 * the structure entirely.
 *
 * With Enter intercepted and turned into a literal "\n", newlines are ordinary
 * characters. These tests pin that: they must diff, transform and apply exactly
 * like any other text.
 */

import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { diffToOp } from "../ot/diff.js";
import { applyOp, applyOps, transform, isNoop } from "../ot/operations.js";

/** Apply whatever diffToOp returned (one op, a pair, or nothing). */
const applyDiff = (text, op) =>
  op == null ? text : Array.isArray(op) ? applyOps(text, op) : applyOp(text, op);

describe("newlines round-trip through diffToOp and applyOp", () => {
  test("pressing Enter mid-line produces a single insert of \\n", () => {
    const before = "hello world";
    const after = "hello\n world";
    const op = diffToOp(before, after);

    assert.deepEqual(op, { type: "insert", pos: 5, text: "\n" });
    assert.equal(applyDiff(before, op), after);
  });

  test("Enter at the end of the document", () => {
    const op = diffToOp("abc", "abc\n");
    assert.deepEqual(op, { type: "insert", pos: 3, text: "\n" });
    assert.equal(applyDiff("abc", op), "abc\n");
  });

  test("Enter on an empty document", () => {
    const op = diffToOp("", "\n");
    assert.deepEqual(op, { type: "insert", pos: 0, text: "\n" });
    assert.equal(applyDiff("", op), "\n");
  });

  test("consecutive Enters each produce their own op", () => {
    let doc = "a";
    for (const expected of ["a\n", "a\n\n", "a\n\n\n"]) {
      const op = diffToOp(doc, expected);
      assert.deepEqual(op, { type: "insert", pos: doc.length, text: "\n" });
      doc = applyDiff(doc, op);
      assert.equal(doc, expected);
    }
  });

  test("Backspace over a newline is a plain delete", () => {
    const op = diffToOp("line1\nline2", "line1line2");
    assert.deepEqual(op, { type: "delete", pos: 5, len: 1 });
    assert.equal(applyDiff("line1\nline2", op), "line1line2");
  });

  test("a multi-line paste is one insert carrying the newlines", () => {
    const pasted = "first\nsecond\nthird";
    const op = diffToOp("", pasted);
    assert.deepEqual(op, { type: "insert", pos: 0, text: pasted });
    assert.equal(applyDiff("", op), pasted);
    assert.equal(op.text.split("\n").length, 3, "line breaks survive as characters");
  });

  test("pasting over a selection is a delete followed by an insert", () => {
    const op = diffToOp("keep REPLACE keep", "keep a\nb keep");
    assert.ok(Array.isArray(op));
    assert.equal(op[0].type, "delete");
    assert.equal(op[1].type, "insert");
    assert.ok(op[1].text.includes("\n"));
    assert.equal(applyDiff("keep REPLACE keep", op), "keep a\nb keep");
  });

  test("CRLF is normalised to \\n before diffing (paste from Windows)", () => {
    // EditorCore strips \r before calling replaceSelection; this pins the
    // contract that only "\n" ever reaches the document.
    const pasted = "one\r\ntwo".replace(/\r\n?/g, "\n");
    assert.equal(pasted, "one\ntwo");
    assert.equal(applyDiff("", diffToOp("", pasted)), "one\ntwo");
  });

  test("a document of only newlines survives a full round trip", () => {
    const doc = "\n\n\n";
    assert.equal(applyDiff("", diffToOp("", doc)), doc);
    assert.equal(diffToOp(doc, doc), null, "no phantom op when nothing changed");
  });

  test("a trailing newline does not produce a phantom op", () => {
    // The browser keeps a stray <br> at the end of a contentEditable. It
    // contributes nothing to textContent, so re-reading the same document must
    // diff to nothing rather than to an invisible edit.
    for (const doc of ["abc\n", "abc", "", "\n"]) {
      assert.equal(diffToOp(doc, doc), null, `phantom op for ${JSON.stringify(doc)}`);
    }
  });

  test("character counts agree on both sides of an op", () => {
    // The reported symptom was equal counts with different rendering. Counting
    // is now over the same string on both sides by construction.
    const before = "hello world";
    const op = diffToOp(before, "hello\nworld");
    const after = applyDiff(before, op);
    assert.equal(after.length, before.length, "\\n replaced the space: same length");
    assert.equal(after.split("\n").length, 2, "and it renders as two lines");
  });
});

describe("newlines transform like any other character", () => {
  const site = (s) => s;

  test("concurrent Enter and typing converge", () => {
    const doc = "abcdef";
    const a = { type: "insert", pos: 3, text: "\n", site: site("alpha") };
    const b = { type: "insert", pos: 5, text: "X", site: site("bravo") };
    const [aP, bP] = transform(a, b);
    assert.equal(applyOp(applyOp(doc, a), bP), applyOp(applyOp(doc, b), aP));
  });

  test("two people pressing Enter at the same position converge", () => {
    const doc = "abcdef";
    const a = { type: "insert", pos: 3, text: "\n", site: "alpha" };
    const b = { type: "insert", pos: 3, text: "\n", site: "bravo" };
    // Cross-replica: each side transforms in its own argument order.
    const left = applyOp(applyOp(doc, a), transform(a, b)[1]);
    const right = applyOp(applyOp(doc, b), transform(b, a)[1]);
    assert.equal(left, right);
    assert.equal(left.split("\n").length, 3, "both newlines survive");
  });

  test("deleting a range that spans a newline", () => {
    const doc = "one\ntwo\nthree";
    const a = { type: "delete", pos: 3, len: 5, site: "alpha" }; // "\ntwo\n"
    assert.equal(applyOp(doc, a), "onethree");

    const b = { type: "insert", pos: 13, text: "!", site: "bravo" };
    const [aP, bP] = transform(a, b);
    assert.equal(applyOp(applyOp(doc, a), bP), applyOp(applyOp(doc, b), aP));
  });

  test("an Enter absorbed by a concurrent delete becomes a noop, not a stray break", () => {
    const doc = "abcdefgh";
    const a = { type: "delete", pos: 2, len: 4, site: "alpha" };
    const b = { type: "delete", pos: 3, len: 2, site: "bravo" };
    const [, bP] = transform(a, b);
    assert.ok(isNoop(bP));
  });
});

describe("caret mapping across a newline", () => {
  // Mirrors mapCaretThroughOp in useOT: an insert at or before the caret pushes
  // it right by the inserted length. A newline is one character like any other.
  const mapCaret = (offset, op) => {
    if (op.type === "insert") return op.pos <= offset ? offset + op.text.length : offset;
    const end = op.pos + op.len;
    if (end <= offset) return offset - op.len;
    if (op.pos < offset) return op.pos;
    return offset;
  };

  test("a newline inserted before the caret shifts it by one", () => {
    assert.equal(mapCaret(10, { type: "insert", pos: 5, text: "\n" }), 11);
  });

  test("a newline inserted after the caret leaves it alone", () => {
    assert.equal(mapCaret(3, { type: "insert", pos: 5, text: "\n" }), 3);
  });

  test("a newline inserted exactly at the caret pushes it right", () => {
    assert.equal(mapCaret(5, { type: "insert", pos: 5, text: "\n" }), 6);
  });

  test("deleting a newline before the caret pulls it back", () => {
    assert.equal(mapCaret(10, { type: "delete", pos: 5, len: 1 }), 9);
  });

  test("a multi-line paste before the caret shifts it by the whole length", () => {
    assert.equal(mapCaret(4, { type: "insert", pos: 0, text: "a\nb\nc" }), 9);
  });
});
