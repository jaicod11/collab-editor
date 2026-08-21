/**
 * components/Editor/MarkdownPreview.jsx
 * ─────────────────────────────────────────────────────────────────────────────
 * Renders the document's markdown source as a READ view.
 *
 * ── Why a read view rather than a live side-by-side preview ──────────────────
 * Three reasons, in order of weight:
 *
 *   1. Exactly one editable surface. Phase 7 spent its whole scope guaranteeing
 *      the contentEditable holds a single flat text node. A second live pane
 *      invites the next person to make the preview editable, and inline WYSIWYG
 *      inside the contentEditable is precisely the DOM-structure problem that
 *      was eliminated.
 *   2. The editor already shares its width with the version history panel. A
 *      third column is cramped at any realistic window size.
 *   3. A useful side-by-side preview needs scroll syncing between source and
 *      render, which is its own piece of work and adds nothing to correctness.
 *
 * ── Sanitisation ─────────────────────────────────────────────────────────────
 * Document content is untrusted: anyone with edit access can type raw HTML into
 * it, and every collaborator renders it. marked converts markdown to HTML and
 * DOMPurify strips anything executable before it reaches the DOM. Raw HTML from
 * document content is NEVER rendered as-is.
 */

import { useMemo } from "react";
import { marked } from "marked";
import DOMPurify from "dompurify";

marked.setOptions({
  gfm: true,
  breaks: true,   // a single newline is a line break, matching what the editor shows
});

/** Markdown source -> sanitised HTML. Exported for testing. */
export function renderMarkdown(source) {
  const html = marked.parse(source ?? "", { async: false });
  return DOMPurify.sanitize(html, {
    // No <script>, no event handlers, no <iframe>, no javascript: URLs.
    USE_PROFILES: { html: true },
    FORBID_TAGS: ["style", "form", "input", "button", "iframe", "object", "embed"],
    FORBID_ATTR: ["style", "onerror", "onload", "onclick"],
  });
}

export default function MarkdownPreview({ source, theme }) {
  const E = theme;
  const html = useMemo(() => renderMarkdown(source), [source]);

  if (!source?.trim()) {
    return (
      <p style={{ color: E.mutedFg, fontSize: 14, fontStyle: "italic" }}>
        Nothing to preview yet.
      </p>
    );
  }

  return (
    <>
      <div
        className="markdown-preview"
        // Safe: `html` is DOMPurify output, never raw document content.
        dangerouslySetInnerHTML={{ __html: html }}
      />
      <style>{`
        .markdown-preview { color:${E.fg}; font-size:16px; line-height:1.75; }
        .markdown-preview h1 { font-size:30px; font-weight:700; margin:22px 0 12px; }
        .markdown-preview h2 { font-size:24px; font-weight:700; margin:20px 0 10px; }
        .markdown-preview h3 { font-size:19px; font-weight:600; margin:18px 0 8px; }
        .markdown-preview p  { margin:0 0 14px; }
        .markdown-preview ul,
        .markdown-preview ol { margin:0 0 14px; padding-left:26px; }
        .markdown-preview li { margin:4px 0; }
        .markdown-preview blockquote {
          margin:0 0 14px; padding:2px 0 2px 14px;
          border-left:3px solid ${E.border}; color:${E.mutedFg};
        }
        .markdown-preview code {
          background:${E.muted}; padding:2px 5px; border-radius:4px;
          font-family:ui-monospace,SFMono-Regular,Menlo,monospace; font-size:14px;
        }
        .markdown-preview pre {
          background:${E.muted}; padding:14px; border-radius:8px;
          overflow-x:auto; margin:0 0 14px;
        }
        .markdown-preview pre code { background:none; padding:0; }
        .markdown-preview a { color:${E.primary}; text-decoration:underline; }
        .markdown-preview hr { border:none; border-top:1px solid ${E.border}; margin:20px 0; }
        .markdown-preview table { border-collapse:collapse; margin:0 0 14px; }
        .markdown-preview th, .markdown-preview td {
          border:1px solid ${E.border}; padding:6px 10px; font-size:14px;
        }
      `}</style>
    </>
  );
}
