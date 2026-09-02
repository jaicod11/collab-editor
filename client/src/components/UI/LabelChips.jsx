/**
 * components/UI/LabelChips.jsx
 * ─────────────────────────────────────────────────────────────────────────────
 * The ONE place a label is rendered.
 *
 * This replaces the TAG column Phase 6 deleted. That column was fabricated: five
 * copies of an inferCategory() helper guessed a category from substrings of the
 * title, and because the copies had different fallbacks the SAME document showed
 * a different category on different pages. The fix is not a better guess — it is
 * a real field on the document plus a single renderer, so every page is showing
 * the same stored value by construction rather than by five helpers agreeing.
 *
 * Deliberately dumb: it takes labels and renders them. It never derives a label
 * from a title, and there is no fallback that invents one — a document with no
 * labels renders nothing at all.
 */

const T = {
    fg: "#f0f0f0",
    border: "#2a2a2a",
    muted: "#1c1c1c",
    mutedFg: "#8a8a8a",
    primary: "#22c55e",
    font: "'Geist', 'DM Sans', sans-serif",
};

/**
 * @param {string[]} labels
 * @param {number}   max        render at most this many, then "+N" (0 = no cap)
 * @param {string}   active     highlight this label as the current filter
 * @param {Function} onClick    (label) => void — makes chips clickable
 * @param {Function} onRemove   (label) => void — adds an × to each chip
 */
export default function LabelChips({
    labels = [], max = 0, active = null, onClick, onRemove, size = "sm",
}) {
    if (!Array.isArray(labels) || labels.length === 0) return null;

    const shown = max > 0 ? labels.slice(0, max) : labels;
    const overflow = max > 0 ? labels.length - shown.length : 0;

    const pad = size === "md" ? "4px 9px" : "2px 7px";
    const font = size === "md" ? 12 : 11;

    return (
        <span style={{ display: "inline-flex", flexWrap: "wrap", gap: 5, alignItems: "center", minWidth: 0 }}>
            {shown.map((label) => {
                const isActive = active != null && label === active;
                const interactive = Boolean(onClick);
                return (
                    <span
                        key={label}
                        onClick={interactive ? (e) => { e.stopPropagation(); onClick(label); } : undefined}
                        style={{
                            display: "inline-flex", alignItems: "center", gap: 4,
                            padding: pad, borderRadius: 999,
                            background: isActive ? "rgba(34,197,94,.14)" : T.muted,
                            border: `1px solid ${isActive ? T.primary : T.border}`,
                            color: isActive ? T.primary : T.mutedFg,
                            fontSize: font, fontFamily: T.font, lineHeight: 1.5,
                            cursor: interactive ? "pointer" : "default",
                            maxWidth: 160, overflow: "hidden",
                            textOverflow: "ellipsis", whiteSpace: "nowrap",
                        }}
                        title={label}
                    >
                        {label}
                        {onRemove && (
                            <button
                                type="button"
                                aria-label={`Remove label ${label}`}
                                onClick={(e) => { e.stopPropagation(); onRemove(label); }}
                                style={{
                                    background: "none", border: "none", padding: 0, margin: 0,
                                    color: "inherit", cursor: "pointer", display: "flex",
                                    fontSize: font + 2, lineHeight: 1, opacity: .7,
                                }}
                            >
                                ×
                            </button>
                        )}
                    </span>
                );
            })}
            {overflow > 0 && (
                <span
                    title={labels.slice(shown.length).join(", ")}
                    style={{ fontSize: font, color: T.mutedFg, fontFamily: T.font }}
                >
                    +{overflow}
                </span>
            )}
        </span>
    );
}
