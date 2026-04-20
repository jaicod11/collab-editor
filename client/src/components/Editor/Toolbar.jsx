/**
 * components/Editor/Toolbar.jsx
 * ─────────────────────────────────────────────────────────────────────────────
 * Rich-text formatting toolbar.
 * Calls document.execCommand for basic formatting (bold, italic, etc.)
 * and fires onFormat(cmd) so the parent can log/debounce saves.
 *
 * Props:
 *   onFormat  {fn}   — called with the command string after each action
 *   disabled  {bool} — grays out toolbar when editor is not focused
 */

import { useState, useCallback } from "react";

// ── Single icon button ────────────────────────────────────────────────────────
function ToolbarBtn({ icon, label, active, onClick, disabled }) {
  return (
    <button
      title={label}
      onClick={onClick}
      disabled={disabled}
      className={`
        p-2 rounded-lg transition-all flex items-center justify-center
        disabled:opacity-40 disabled:cursor-not-allowed
        ${active
          ? "bg-primary text-on-primary shadow-sm"
          : "text-on-surface-variant hover:bg-surface-container-high hover:text-on-surface"
        }
      `}
    >
      <span className="material-symbols-outlined text-[18px]">{icon}</span>
    </button>
  );
}

function ToolbarDivider() {
  return <div className="w-[1px] h-5 bg-outline-variant/30 mx-1 flex-shrink-0" />;
}

// ── Heading dropdown ──────────────────────────────────────────────────────────
function HeadingSelect({ onSelect, disabled }) {
  return (
    <select
      onChange={(e) => { if (e.target.value) onSelect(e.target.value); e.target.value = ""; }}
      disabled={disabled}
      defaultValue=""
      className="
        text-xs font-label font-semibold text-on-surface-variant
        bg-surface-container-low border-none rounded-lg px-2 py-1.5 outline-none
        hover:bg-surface-container-high cursor-pointer disabled:opacity-40
      "
    >
      <option value="" disabled>Heading</option>
      <option value="h1">Heading 1</option>
      <option value="h2">Heading 2</option>
      <option value="h3">Heading 3</option>
      <option value="p">Paragraph</option>
    </select>
  );
}

// ── Color picker ──────────────────────────────────────────────────────────────
const TEXT_COLORS = ["#19315d","#ef4444","#f97316","#eab308","#22c55e","#3b82f6","#8b5cf6","#ec4899"];

function ColorPicker({ onColor, disabled }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="relative">
      <button
        title="Text color"
        onClick={() => setOpen((o) => !o)}
        disabled={disabled}
        className="p-2 rounded-lg text-on-surface-variant hover:bg-surface-container-high transition-all disabled:opacity-40"
      >
        <span className="material-symbols-outlined text-[18px]">palette</span>
      </button>
      {open && (
        <div
          className="absolute top-10 left-0 z-50 bg-surface-container-lowest rounded-xl shadow-lg p-2 grid grid-cols-4 gap-1 border border-outline-variant/20"
          onMouseLeave={() => setOpen(false)}
        >
          {TEXT_COLORS.map((c) => (
            <button
              key={c}
              onClick={() => { document.execCommand("foreColor", false, c); onColor?.(c); setOpen(false); }}
              className="w-6 h-6 rounded-full border-2 border-white/20 hover:scale-110 transition-transform"
              style={{ backgroundColor: c }}
              title={c}
            />
          ))}
        </div>
      )}
    </div>
  );
}

// ── ROOT: Toolbar ─────────────────────────────────────────────────────────────
export default function Toolbar({ onFormat, disabled = false }) {
  const [active, setActive] = useState(new Set());

  const exec = useCallback((cmd) => {
    document.execCommand(cmd, false, null);
    setActive((prev) => {
      const next = new Set(prev);
      next.has(cmd) ? next.delete(cmd) : next.add(cmd);
      return next;
    });
    onFormat?.(cmd);
  }, [onFormat]);

  const heading = useCallback((tag) => {
    document.execCommand("formatBlock", false, tag);
    onFormat?.(tag);
  }, [onFormat]);

  return (
    <div className="flex items-center gap-0.5 px-4 py-2 border-b border-outline-variant/10 bg-surface-container-lowest flex-wrap sticky top-[60px] z-30">

      {/* Text style */}
      <ToolbarBtn icon="format_bold"       label="Bold (Ctrl+B)"        active={active.has("bold")}          disabled={disabled} onClick={() => exec("bold")} />
      <ToolbarBtn icon="format_italic"     label="Italic (Ctrl+I)"      active={active.has("italic")}        disabled={disabled} onClick={() => exec("italic")} />
      <ToolbarBtn icon="format_underlined" label="Underline (Ctrl+U)"   active={active.has("underline")}     disabled={disabled} onClick={() => exec("underline")} />
      <ToolbarBtn icon="strikethrough_s"   label="Strikethrough"        active={active.has("strikeThrough")} disabled={disabled} onClick={() => exec("strikeThrough")} />

      <ToolbarDivider />

      {/* Headings */}
      <HeadingSelect onSelect={heading} disabled={disabled} />

      <ToolbarDivider />

      {/* Lists */}
      <ToolbarBtn icon="format_list_bulleted"  label="Bullet list"   active={false} disabled={disabled} onClick={() => exec("insertUnorderedList")} />
      <ToolbarBtn icon="format_list_numbered"  label="Numbered list" active={false} disabled={disabled} onClick={() => exec("insertOrderedList")} />

      <ToolbarDivider />

      {/* Alignment */}
      <ToolbarBtn icon="format_align_left"   label="Align left"   active={false} disabled={disabled} onClick={() => exec("justifyLeft")} />
      <ToolbarBtn icon="format_align_center" label="Align center" active={false} disabled={disabled} onClick={() => exec("justifyCenter")} />
      <ToolbarBtn icon="format_align_right"  label="Align right"  active={false} disabled={disabled} onClick={() => exec("justifyRight")} />

      <ToolbarDivider />

      {/* Insert */}
      <ToolbarBtn icon="link"           label="Insert link"  active={false} disabled={disabled} onClick={() => {
        const url = window.prompt("Enter URL:");
        if (url) document.execCommand("createLink", false, url);
        onFormat?.("link");
      }} />
      <ColorPicker onColor={() => onFormat?.("color")} disabled={disabled} />

      <ToolbarDivider />

      {/* Undo / Redo */}
      <ToolbarBtn icon="undo" label="Undo (Ctrl+Z)" active={false} disabled={disabled} onClick={() => exec("undo")} />
      <ToolbarBtn icon="redo" label="Redo (Ctrl+Y)" active={false} disabled={disabled} onClick={() => exec("redo")} />
    </div>
  );
}
