/**
 * components/Editor/PrintableDocument.jsx
 * ─────────────────────────────────────────────────────────────────────────────
 * Renders the document for printing / "Save as PDF".
 *
 * ── Why the browser's print pipeline and not a PDF library ───────────────────
 * The read view already turns markdown into sanitised HTML (marked +
 * DOMPurify), so a print stylesheet reuses it with no new dependency. The
 * output is selectable text with working links rather than a rasterised image,
 * and page breaking, widow/orphan handling and margins come from the browser.
 *
 * ── Why a portal, always mounted ─────────────────────────────────────────────
 * The node lives directly under <body>, outside #root, so print CSS can hide
 * the entire application in one rule and reveal only this. It stays mounted and
 * merely hidden on screen: printing must not unmount the editor, which would
 * drop socket listeners, pending operations and the caret — the same reason the
 * markdown preview keeps the editor mounted.
 */

import { useMemo } from "react";
import { createPortal } from "react-dom";
import { renderMarkdown } from "./MarkdownPreview";

export default function PrintableDocument({ title, source }) {
  // Same sanitised pipeline as the read view. Document content is untrusted,
  // so nothing unsanitised is ever injected here.
  const html = useMemo(() => renderMarkdown(source), [source]);

  return createPortal(
    <div className="print-root" aria-hidden="true">
      <h1 className="print-title">{title || "Untitled Document"}</h1>
      <div
        className="print-body"
        // Safe: DOMPurify output, never raw document content.
        dangerouslySetInnerHTML={{ __html: html }}
      />

      <style>{`
        /* Hidden on screen; the editor is unaffected. */
        .print-root { display: none; }

        @media print {
          /* Hide the entire app — navbar, markdown toolbar, sidebar, history
             panel, cursor overlay, presence avatars, toasts — in one rule, by
             hiding the React root and revealing only this node. */
          #root { display: none !important; }

          .print-root {
            display: block !important;
            margin: 0;
            padding: 0;
            color: #000;
            background: #fff;
            font-family: Georgia, "Times New Roman", serif;
            font-size: 11.5pt;
            line-height: 1.55;
          }

          @page { margin: 20mm; }

          .print-title {
            font-size: 22pt;
            font-weight: 700;
            margin: 0 0 4mm;
            padding-bottom: 3mm;
            border-bottom: 1px solid #ccc;
            /* Never leave the title stranded at the foot of a page. */
            break-after: avoid;
            page-break-after: avoid;
          }

          /* The document is plain text with markdown. "\\n" is a real character
             (Phase 7), rendered as <br> by marked's breaks:true — pre-wrap here
             as well so any literal whitespace matches the read view. */
          .print-body { white-space: normal; }
          .print-body p { margin: 0 0 3.5mm; orphans: 3; widows: 3; }

          .print-body h1, .print-body h2, .print-body h3 {
            font-family: Georgia, "Times New Roman", serif;
            break-after: avoid;
            page-break-after: avoid;
            margin: 6mm 0 2.5mm;
          }
          .print-body h1 { font-size: 17pt; }
          .print-body h2 { font-size: 14.5pt; }
          .print-body h3 { font-size: 12.5pt; }

          .print-body ul, .print-body ol { margin: 0 0 3.5mm; padding-left: 8mm; }
          .print-body li { margin: 1mm 0; }

          .print-body blockquote {
            margin: 0 0 3.5mm; padding-left: 4mm;
            border-left: 2pt solid #bbb; color: #333; font-style: italic;
            break-inside: avoid; page-break-inside: avoid;
          }

          .print-body code {
            font-family: "SFMono-Regular", Menlo, Consolas, monospace;
            font-size: 10pt; background: #f2f2f2; padding: 0.5mm 1mm; border-radius: 2px;
          }
          .print-body pre {
            background: #f6f6f6; border: 1px solid #e0e0e0; border-radius: 2mm;
            padding: 3mm; margin: 0 0 3.5mm; font-size: 9.5pt;
            /* Long code should flow rather than be clipped at the page edge. */
            white-space: pre-wrap; word-wrap: break-word;
            break-inside: avoid-page; page-break-inside: avoid;
          }
          .print-body pre code { background: none; padding: 0; }

          /* Links stay clickable in the PDF and readable on paper. */
          .print-body a { color: #000; text-decoration: underline; }

          .print-body table {
            border-collapse: collapse; margin: 0 0 3.5mm; width: 100%;
            break-inside: avoid; page-break-inside: avoid;
          }
          .print-body th, .print-body td {
            border: 1px solid #bbb; padding: 1.5mm 2.5mm; font-size: 10pt;
          }

          .print-body img { max-width: 100%; }
          .print-body hr { border: none; border-top: 1px solid #ccc; margin: 5mm 0; }
        }
      `}</style>
    </div>,
    document.body
  );
}
