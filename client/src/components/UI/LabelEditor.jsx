/**
 * components/UI/LabelEditor.jsx
 * ─────────────────────────────────────────────────────────────────────────────
 * Add and remove a document's labels, in a modal.
 *
 * The whole set is sent on save (PUT), not individual add/remove calls: the
 * server's normalisation can collapse two entries into one or drop one
 * entirely, so a per-chip endpoint would leave the client guessing what the
 * stored set became. Sending the set and rendering exactly what comes back
 * means the chips can never disagree with what the filter matches.
 *
 * Suggestions come from labels already in use on documents this user can see,
 * which is what keeps free-form labels from fragmenting in practice — you pick
 * "urgent" off the list instead of typing "Urgent" and creating a near-duplicate
 * (the server would lowercase it anyway, which is the backstop).
 */

import { useEffect, useRef, useState } from "react";
import LabelChips from "./LabelChips";

const T = {
    surface: "#141414",
    fg: "#f0f0f0",
    border: "#222222",
    primary: "#22c55e",
    primFg: "#0d0d0d",
    muted: "#1c1c1c",
    mutedFg: "#7a7a7a",
    font: "'Geist', 'DM Sans', sans-serif",
};

const MAX_LABELS = 10;      // mirrors Document.MAX_LABELS
const MAX_LENGTH = 32;      // mirrors Document.MAX_LABEL_LENGTH

/** Client-side echo of the server's rule, so the preview matches what is stored. */
function normalise(raw) {
    return String(raw).trim().replace(/\s+/g, " ").toLowerCase().slice(0, MAX_LENGTH);
}

export default function LabelEditor({ docTitle, initial = [], suggestions = [], onSave, onClose }) {
    const [labels, setLabels] = useState(() => [...new Set(initial.map(normalise).filter(Boolean))]);
    const [draft, setDraft] = useState("");
    const [saving, setSaving] = useState(false);
    const inputRef = useRef(null);

    useEffect(() => { inputRef.current?.focus(); }, []);

    const add = (raw) => {
        const label = normalise(raw);
        if (!label || labels.includes(label) || labels.length >= MAX_LABELS) return;
        setLabels((prev) => [...prev, label]);
        setDraft("");
    };

    const remove = (label) => setLabels((prev) => prev.filter((l) => l !== label));

    const onKeyDown = (e) => {
        if (e.key === "Enter" || e.key === ",") { e.preventDefault(); add(draft); }
        // Backspace on an empty input removes the last chip — the standard
        // behaviour for this control, and the only way to undo without reaching
        // for the mouse.
        else if (e.key === "Backspace" && draft === "" && labels.length) {
            setLabels((prev) => prev.slice(0, -1));
        }
    };

    const submit = async () => {
        setSaving(true);
        await onSave(labels);
        setSaving(false);
    };

    const unused = suggestions.filter((s) => !labels.includes(s)).slice(0, 12);
    const atCap = labels.length >= MAX_LABELS;

    return (
        <div
            style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,.6)", zIndex: 320, display: "flex", alignItems: "center", justifyContent: "center" }}
            onClick={onClose}
        >
            <div
                onClick={(e) => e.stopPropagation()}
                style={{ background: T.surface, border: `1px solid ${T.border}`, borderRadius: 10, padding: 22, width: 420, maxWidth: "92vw", boxShadow: "0 20px 60px rgba(0,0,0,.6)" }}
            >
                <h3 style={{ margin: 0, fontSize: 15, fontWeight: 600, color: T.fg, fontFamily: T.font }}>
                    Labels
                </h3>
                {docTitle && (
                    <p style={{ margin: "4px 0 16px", fontSize: 12, color: T.mutedFg, fontFamily: T.font, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                        {docTitle}
                    </p>
                )}

                <div style={{ marginBottom: 10, minHeight: 26 }}>
                    {labels.length > 0
                        ? <LabelChips labels={labels} onRemove={remove} size="md" />
                        : <span style={{ fontSize: 12, color: T.mutedFg, fontFamily: T.font }}>No labels yet.</span>}
                </div>

                <input
                    ref={inputRef}
                    value={draft}
                    onChange={(e) => setDraft(e.target.value)}
                    onKeyDown={onKeyDown}
                    onBlur={() => draft && add(draft)}
                    maxLength={MAX_LENGTH}
                    disabled={atCap}
                    placeholder={atCap ? `Limit of ${MAX_LABELS} labels reached` : "Type a label, then Enter"}
                    style={{
                        width: "100%", boxSizing: "border-box", background: T.muted,
                        border: `1px solid ${T.border}`, borderRadius: 6, padding: "9px 11px",
                        color: T.fg, fontSize: 13, fontFamily: T.font, outline: "none",
                    }}
                />

                {unused.length > 0 && !atCap && (
                    <div style={{ marginTop: 12 }}>
                        <span style={{ fontSize: 10.5, fontWeight: 500, color: T.mutedFg, textTransform: "uppercase", letterSpacing: "0.08em", fontFamily: T.font }}>
                            Already in use
                        </span>
                        <div style={{ marginTop: 7 }}>
                            <LabelChips labels={unused} onClick={add} />
                        </div>
                    </div>
                )}

                <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginTop: 20 }}>
                    <button
                        onClick={onClose}
                        style={{ background: "none", border: `1px solid ${T.border}`, borderRadius: 6, padding: "8px 14px", color: T.mutedFg, fontSize: 13, cursor: "pointer", fontFamily: T.font }}
                    >
                        Cancel
                    </button>
                    <button
                        onClick={submit}
                        disabled={saving}
                        style={{ background: T.primary, border: "none", borderRadius: 6, padding: "8px 16px", color: T.primFg, fontSize: 13, fontWeight: 500, cursor: saving ? "default" : "pointer", opacity: saving ? .6 : 1, fontFamily: T.font }}
                    >
                        {saving ? "Saving…" : "Save"}
                    </button>
                </div>
            </div>
        </div>
    );
}
