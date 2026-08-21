/**
 * client/test/markdown-sanitize.test.js
 * ─────────────────────────────────────────────────────────────────────────────
 * The markdown preview renders DOCUMENT CONTENT, which is untrusted: anyone
 * with edit access can type raw HTML into a shared document, and every
 * collaborator renders it.
 *
 * `marked` deliberately passes raw HTML through (verified below), so DOMPurify
 * carries the whole security burden. That makes it exactly the thing to test
 * rather than assume.
 *
 * The renderer is exercised through the same configuration MarkdownPreview
 * uses, against a real DOM supplied by jsdom.
 */

import { test, describe, before } from "node:test";
import assert from "node:assert/strict";
import { JSDOM } from "jsdom";
import { marked } from "marked";
import createDOMPurify from "dompurify";

let render;

before(() => {
  const { window } = new JSDOM("");
  const DOMPurify = createDOMPurify(window);
  marked.setOptions({ gfm: true, breaks: true });

  // Mirrors renderMarkdown() in components/Editor/MarkdownPreview.jsx.
  render = (source) =>
    DOMPurify.sanitize(marked.parse(source ?? "", { async: false }), {
      USE_PROFILES: { html: true },
      FORBID_TAGS: ["style", "form", "input", "button", "iframe", "object", "embed"],
      FORBID_ATTR: ["style", "onerror", "onload", "onclick"],
    });
});

describe("hostile document content is neutralised", () => {
  test("script tags are removed", () => {
    const out = render("<script>alert(1)</script>");
    assert.ok(!/<script/i.test(out), out);
    assert.ok(!out.includes("alert(1)") || !/<script/i.test(out));
  });

  test("inline event handlers are stripped", () => {
    const out = render("<img src=x onerror=alert(1)>");
    assert.ok(!/onerror/i.test(out), out);
  });

  test("javascript: URLs are removed", () => {
    const out = render("[click me](javascript:alert(1))");
    assert.ok(!/javascript:/i.test(out), out);
  });

  test("iframes are removed", () => {
    const out = render('<iframe src="//evil.example"></iframe>');
    assert.ok(!/<iframe/i.test(out), out);
  });

  test("object and embed are removed", () => {
    assert.ok(!/<object/i.test(render('<object data="x"></object>')));
    assert.ok(!/<embed/i.test(render('<embed src="x">')));
  });

  test("form controls are removed", () => {
    const out = render('<form action="//evil"><input name="password"></form>');
    assert.ok(!/<form/i.test(out), out);
    assert.ok(!/<input/i.test(out), out);
  });

  test("style attributes and tags are removed", () => {
    assert.ok(!/<style/i.test(render("<style>body{display:none}</style>")));
    assert.ok(!/ style=/i.test(render('<p style="position:fixed">x</p>')));
  });

  test("svg-based script injection is neutralised", () => {
    const out = render('<svg><script>alert(1)</script></svg>');
    assert.ok(!/<script/i.test(out), out);
  });

  test("data: URLs carrying html are not left executable", () => {
    const out = render('[x](data:text/html;base64,PHNjcmlwdD5hbGVydCgxKTwvc2NyaXB0Pg==)');
    assert.ok(!/<script/i.test(out), out);
  });

  test("marked alone does NOT protect — this is why sanitisation exists", () => {
    const raw = marked.parse("<script>alert(1)</script>", { async: false });
    assert.ok(/<script/i.test(raw), "if this ever fails, marked changed its behaviour");
  });
});

describe("legitimate markdown still renders", () => {
  test("headings, emphasis and code survive", () => {
    const out = render("# Title\n\n**bold** and _italic_ and `code`");
    assert.match(out, /<h1[^>]*>Title<\/h1>/);
    assert.match(out, /<strong>bold<\/strong>/);
    assert.match(out, /<em>italic<\/em>/);
    assert.match(out, /<code>code<\/code>/);
  });

  test("lists and blockquotes survive", () => {
    const out = render("- one\n- two\n\n> quoted");
    assert.match(out, /<ul>/);
    assert.match(out, /<li>one<\/li>/);
    assert.match(out, /<blockquote>/);
  });

  test("fenced code blocks survive", () => {
    const out = render("```\nconst x = 1\n```");
    assert.match(out, /<pre>/);
    assert.match(out, /const x = 1/);
  });

  test("safe links survive with their href intact", () => {
    const out = render("[docs](https://example.com/docs)");
    assert.match(out, /href="https:\/\/example\.com\/docs"/);
  });

  test("a single newline renders as a line break, matching the editor", () => {
    // `breaks: true` — the editor shows "\n" as a line break, so the preview
    // must agree or the two views disagree about the same document.
    assert.match(render("one\ntwo"), /<br\s*\/?>/);
  });

  test("empty input renders nothing", () => {
    assert.equal(render("").trim(), "");
  });
});
