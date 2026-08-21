/**
 * client/test/export-document.test.js
 * ─────────────────────────────────────────────────────────────────────────────
 * PDF export goes through the browser's print pipeline, reusing the read view's
 * sanitised markdown renderer.
 *
 * Two things are worth pinning: the suggested filename (browsers take it from
 * document.title, so a plain window.print() offers "about:blank" or the route),
 * and that the printable copy renders through the SAME sanitiser as the read
 * view rather than injecting document content directly.
 */

import { test, describe, before } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { JSDOM } from "jsdom";
import { marked } from "marked";
import createDOMPurify from "dompurify";
import { printTitleFor } from "../src/lib/exportDocument.js";

describe("suggested PDF filename", () => {
  test("derives from the document title", () => {
    assert.equal(printTitleFor("Quarterly Notes"), "Quarterly Notes");
  });

  test("falls back for an empty or missing title", () => {
    for (const input of ["", "   ", null, undefined]) {
      assert.equal(printTitleFor(input), "Untitled Document");
    }
  });

  test("strips characters that are illegal in a filename", () => {
    assert.equal(printTitleFor('Q3: plans/ideas <draft>'), "Q3 plans ideas draft");
    assert.equal(printTitleFor('a\\b:c*d?e"f<g>h|i'), "a b c d e f g h i");
  });

  test("collapses whitespace and trims", () => {
    assert.equal(printTitleFor("  spaced    out  "), "spaced out");
    assert.equal(printTitleFor("line\nbreak"), "line break");
  });

  test("bounds the length", () => {
    assert.equal(printTitleFor("x".repeat(500)).length, 120);
  });

  test("a title of only illegal characters still yields a usable name", () => {
    assert.equal(printTitleFor("///:::"), "Untitled Document");
  });
});

describe("the printable copy uses the sanitised pipeline", () => {
  let render;
  before(() => {
    const { window } = new JSDOM("");
    const DOMPurify = createDOMPurify(window);
    marked.setOptions({ gfm: true, breaks: true });
    render = (source) =>
      DOMPurify.sanitize(marked.parse(source ?? "", { async: false }), {
        USE_PROFILES: { html: true },
        FORBID_TAGS: ["style", "form", "input", "button", "iframe", "object", "embed"],
        FORBID_ATTR: ["style", "onerror", "onload", "onclick"],
      });
  });

  test("PrintableDocument imports renderMarkdown rather than rendering its own HTML", () => {
    // Structural guard: the export path must not grow a second, unsanitised
    // renderer. Document content is untrusted and every collaborator prints it.
    const src = readFileSync(new URL("../src/components/Editor/PrintableDocument.jsx", import.meta.url), "utf8");
    assert.match(src, /import \{ renderMarkdown \} from "\.\/MarkdownPreview"/);
    assert.match(src, /renderMarkdown\(source\)/);
    // The only dangerouslySetInnerHTML must be fed from that call.
    const injections = src.match(/dangerouslySetInnerHTML/g) ?? [];
    assert.equal(injections.length, 1, "exactly one injection point");
    assert.match(src, /__html: html/);
  });

  test("hostile content is neutralised in the print output too", () => {
    const out = render("<script>alert(1)</script>\n\n[x](javascript:alert(1))");
    assert.ok(!/<script/i.test(out), out);
    assert.ok(!/javascript:/i.test(out), out);
  });

  test("newlines render as breaks, matching the read view", () => {
    // Phase 7 made "\n" a real document character. The printed output has to
    // agree with what the editor and the preview show.
    const out = render("one\ntwo\nthree");
    assert.equal((out.match(/<br\s*\/?>/g) ?? []).length, 2);
  });

  test("markdown structure survives into print", () => {
    const out = render("# Title\n\n- a\n- b\n\n> quote\n\n```\ncode\n```");
    assert.match(out, /<h1[^>]*>Title<\/h1>/);
    assert.match(out, /<ul>/);
    assert.match(out, /<blockquote>/);
    assert.match(out, /<pre>/);
  });
});

describe("printing must not disturb the editor", () => {
  const page = readFileSync(new URL("../src/pages/EditorPage.jsx", import.meta.url), "utf8");
  const printable = readFileSync(new URL("../src/components/Editor/PrintableDocument.jsx", import.meta.url), "utf8");

  test("the printable copy is always mounted, not conditionally rendered", () => {
    // A conditional mount would unmount/remount around printing; the editor
    // itself must never be torn down (socket listeners, pending ops, caret).
    assert.match(page, /<PrintableDocument title=\{title\} source=\{markdownSource\} \/>/);
    assert.ok(
      !/\{\s*\w+\s*&&\s*<PrintableDocument/.test(page),
      "PrintableDocument must not be behind a conditional"
    );
  });

  test("it renders into document.body via a portal, outside the React root", () => {
    // So one print rule can hide the whole application.
    assert.match(printable, /createPortal\(/);
    assert.match(printable, /document\.body/);
    assert.match(printable, /#root \{ display: none !important; \}/);
  });

  test("export is not gated on the editor role", () => {
    // Viewers can already read the content; exporting is a read operation.
    const handler = page.slice(page.indexOf("const handleExport"), page.indexOf("const handleExport") + 200);
    assert.ok(!/isViewer|readOnly/.test(handler), "export must not check the role");
  });
});
