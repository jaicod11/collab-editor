/**
 * components/Editor/MarkdownToolbar.jsx
 * ─────────────────────────────────────────────────────────────────────────────
 * Markdown formatting controls.
 *
 * Every action is a pure text transform from shared/ot/markdown.js, applied
 * through the same path as typing — so it produces ordinary insert/delete
 * operations and syncs with no special handling. Nothing here writes to the DOM.
 *
 * This replaces the execCommand toolbar removed in Phase 6, which wrote HTML the
 * sync engine could not see.
 */

import {
  toggleWrap, toggleLinePrefix, toggleOrderedList, toggleCodeBlock, insertLink,
} from "@shared/ot/markdown.js";

/** label, title, and the transform each button applies. */
export const MARKDOWN_ACTIONS = [
  { id: "bold", label: "B", title: "Bold  (Ctrl/Cmd+B)", weight: 700,
    apply: (t, s, e) => toggleWrap(t, s, e, "**") },
  { id: "italic", label: "I", title: "Italic  (Ctrl/Cmd+I)", italic: true,
    apply: (t, s, e) => toggleWrap(t, s, e, "_") },
  { id: "strike", label: "S", title: "Strikethrough", strike: true,
    apply: (t, s, e) => toggleWrap(t, s, e, "~~") },
  { id: "code", label: "</>", title: "Inline code", mono: true,
    apply: (t, s, e) => toggleWrap(t, s, e, "`") },
  { divider: true, id: "d1" },
  { id: "h1", label: "H1", title: "Heading 1",
    apply: (t, s, e) => toggleLinePrefix(t, s, e, "# ", { replaces: ["## ", "### "] }) },
  { id: "h2", label: "H2", title: "Heading 2",
    apply: (t, s, e) => toggleLinePrefix(t, s, e, "## ", { replaces: ["# ", "### "] }) },
  { id: "h3", label: "H3", title: "Heading 3",
    apply: (t, s, e) => toggleLinePrefix(t, s, e, "### ", { replaces: ["# ", "## "] }) },
  { divider: true, id: "d2" },
  { id: "ul", label: "•", title: "Bullet list",
    apply: (t, s, e) => toggleLinePrefix(t, s, e, "- ") },
  { id: "ol", label: "1.", title: "Numbered list",
    apply: (t, s, e) => toggleOrderedList(t, s, e) },
  { id: "quote", label: "❝", title: "Blockquote",
    apply: (t, s, e) => toggleLinePrefix(t, s, e, "> ") },
  { id: "codeblock", label: "{ }", title: "Code block", mono: true,
    apply: (t, s, e) => toggleCodeBlock(t, s, e) },
  { divider: true, id: "d3" },
  { id: "link", label: "🔗", title: "Link",
    apply: (t, s, e) => insertLink(t, s, e) },
];

function Btn({ item, theme, onClick, disabled }) {
  const E = theme;
  return (
    <button
      type="button"
      title={item.title}
      aria-label={item.title}
      disabled={disabled}
      // Keep the editor's selection: focus must not move to the button.
      onMouseDown={(e) => e.preventDefault()}
      onClick={() => onClick(item)}
      style={{
        minWidth: 28, height: 26, padding: "0 7px",
        background: "none", border: "none", borderRadius: 4,
        color: disabled ? E.border : E.mutedFg,
        cursor: disabled ? "not-allowed" : "pointer",
        fontSize: 12,
        fontWeight: item.weight ?? 500,
        fontStyle: item.italic ? "italic" : "normal",
        textDecoration: item.strike ? "line-through" : "none",
        fontFamily: item.mono ? "ui-monospace,SFMono-Regular,Menlo,monospace" : E.font,
        display: "flex", alignItems: "center", justifyContent: "center",
        transition: "all .12s",
      }}
      onMouseEnter={(e) => { if (!disabled) { e.currentTarget.style.background = "rgba(255,255,255,.07)"; e.currentTarget.style.color = E.fg; } }}
      onMouseLeave={(e) => { e.currentTarget.style.background = "none"; e.currentTarget.style.color = disabled ? E.border : E.mutedFg; }}
    >
      {item.label}
    </button>
  );
}

export default function MarkdownToolbar({ theme, disabled = false, onAction, preview, onTogglePreview }) {
  const E = theme;
  return (
    <div style={{
      display: "flex", alignItems: "center", gap: 1,
      padding: "3px 10px", height: 36,
      background: E.sidebar, borderBottom: `1px solid ${E.border}`,
      flexShrink: 0, overflowX: "auto",
    }}>
      {MARKDOWN_ACTIONS.map((item) =>
        item.divider ? (
          <div key={item.id} style={{ width: 1, height: 18, background: E.border, margin: "0 5px", flexShrink: 0 }} />
        ) : (
          <Btn key={item.id} item={item} theme={E} disabled={disabled} onClick={onAction} />
        )
      )}

      <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 8 }}>
        <span style={{ fontSize: 11, color: E.mutedFg }}>Markdown</span>
        <button
          type="button"
          onClick={onTogglePreview}
          style={{
            padding: "3px 10px", borderRadius: 5, fontSize: 11, fontWeight: 600,
            background: preview ? E.primary : "none",
            color: preview ? E.primFg : E.mutedFg,
            border: `1px solid ${preview ? E.primary : E.border}`,
            cursor: "pointer", fontFamily: E.font, whiteSpace: "nowrap",
          }}
        >
          {preview ? "Editing" : "Preview"}
        </button>
      </div>
    </div>
  );
}
