/**
 * pages/TrashPage.jsx
 * ─────────────────────────────────────────────────────────────────────────────
 * Trash / Deleted Documents page converted from Stitch HTML.
 *
 * Columns: TITLE | TAG | DELETED BY | DELETED AT | (restore) | (×)
 *
 * Features:
 *  - Loads archived/deleted documents from API
 *  - Per-category colored tags + "General" gray tag
 *  - Restore icon → restores doc back to Active, removes from list
 *  - × icon → permanently deletes with confirm modal
 *  - "Empty Trash" button → confirm modal → bulk permanent delete
 *  - Info bar: "Restoring a document will move it back to My Documents."
 *  - Empty state with trash icon
 *
 * Backend note:
 *  Trash uses status:"Archived" as a proxy until a "Deleted" status is added.
 *  Restore → PATCH /api/documents/:id { status:"Active" }
 *  Delete  → DELETE /api/documents/:id
 */

import { useState, useEffect, useCallback, useRef, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { useToast } from "../components/UI/Toast";
import { useAuthStore } from "../store/authSlice";
import Sidebar, { T, Icons } from "../components/Layout/Sidebar";
import api from "../services/api";

// ─── Category tag colors (same as SharedWithMePage + General) ─────────────────
const CAT_COLORS = {
    General: { bg: "rgba(122,122,122,.12)", text: "#7a7a7a" },
    Product: { bg: "rgba(61,220,110,.13)", text: "#3ddc6e" },
    Design: { bg: "rgba(224,92,42,.13)", text: "#e05c2a" },
    Engineering: { bg: "rgba(42,122,224,.13)", text: "#2a7ae0" },
    Research: { bg: "rgba(200,168,0,.13)", text: "#c8a800" },
    Finance: { bg: "rgba(139,42,224,.13)", text: "#8b2ae0" },
    Marketing: { bg: "rgba(224,42,106,.13)", text: "#e02a6a" },
};

const CAT_ICON_COLOR = {
    General: "#7a7a7a",
    Product: "#3ddc6e",
    Design: "#e05c2a",
    Engineering: "#2a7ae0",
    Research: "#c8a800",
    Finance: "#8b2ae0",
    Marketing: "#e02a6a",
};

// ─── Helpers ──────────────────────────────────────────────────────────────────
function docPk(doc) { return doc?._id ?? doc?.id ?? ""; }
function ownerName(o) { if (!o) return "You"; return typeof o === "object" ? (o.name ?? o.email ?? "You") : String(o); }
function userInitials(n) { if (!n) return "?"; return n.split(" ").map(x => x[0]).join("").toUpperCase().slice(0, 2); }

function fmtDate(d) {
    if (!d) return "—";
    const dt = new Date(d), now = new Date(), diff = now - dt;
    const hrs = Math.round(diff / 3600000);
    if (hrs < 1) return `Today at ${dt.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })}`;
    if (hrs < 24) return `Today at ${dt.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })}`;
    if (hrs < 48) return `Yesterday at ${dt.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })}`;
    return dt.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });
}

function inferCategory(t = "") {
    const s = t.toLowerCase();
    if (s.includes("design") || s.includes("brand") || s.includes("refresh")) return "Design";
    if (s.includes("engineer") || s.includes("api") || s.includes("migration")) return "Engineering";
    if (s.includes("research") || s.includes("survey") || s.includes("interview")) return "Research";
    if (s.includes("market") || s.includes("copy") || s.includes("campaign")) return "Marketing";
    if (s.includes("finance") || s.includes("investor") || s.includes("budget")) return "Finance";
    if (s.includes("product") || s.includes("roadmap") || s.includes("okr")) return "Product";
    return "General";
}

// ─── Row icons (colored per category) ────────────────────────────────────────
const ROW_ICONS = [
    (c) => <svg xmlns="http://www.w3.org/2000/svg" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round"><path d="M6 22a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h8a2.4 2.4 0 0 1 1.704.706l3.588 3.588A2.4 2.4 0 0 1 20 8v12a2 2 0 0 1-2 2z" /><path d="M14 2v5a1 1 0 0 0 1 1h5" /></svg>,
    (c) => <svg xmlns="http://www.w3.org/2000/svg" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round"><path d="M14.106 5.553a2 2 0 0 0 1.788 0l3.659-1.83A1 1 0 0 1 21 4.619v12.764a1 1 0 0 1-.553.894l-4.553 2.277a2 2 0 0 1-1.788 0l-4.212-2.106a2 2 0 0 0-1.788 0l-3.659 1.83A1 1 0 0 1 3 19.381V6.618a1 1 0 0 1 .553-.894l4.553-2.277a2 2 0 0 1 1.788 0zm.894.211v15M9 3.236v15" /></svg>,
    (c) => <svg xmlns="http://www.w3.org/2000/svg" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round"><path d="m18 16 4-4-4-4M6 8l-4 4 4 4m8.5-12-5 16" /></svg>,
    (c) => <svg xmlns="http://www.w3.org/2000/svg" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" /></svg>,
    (c) => <svg xmlns="http://www.w3.org/2000/svg" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round"><rect width="18" height="18" x="3" y="3" rx="2" /><path d="M3 9h18M3 15h18M9 3v18" /></svg>,
    (c) => <svg xmlns="http://www.w3.org/2000/svg" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round"><path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z" /><path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z" /></svg>,
];

// ─── Restore icon SVG ─────────────────────────────────────────────────────────
const RestoreIcon = ({ color = T.mutedFg }) => (
    <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round">
        <path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" />
        <path d="M3 3v5h5" />
    </svg>
);

// ─── Confirm modal (shared for delete + empty trash) ─────────────────────────
function ConfirmModal({ title, message, confirmLabel, onConfirm, onClose, danger = true }) {
    return (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,.65)", zIndex: 200, display: "flex", alignItems: "center", justifyContent: "center" }}
            onClick={onClose}>
            <div onClick={(e) => e.stopPropagation()}
                style={{ background: T.surface, border: `1px solid ${T.border}`, borderRadius: 10, padding: 28, width: 400, boxShadow: "0 20px 60px rgba(0,0,0,.6)" }}>
                <h3 style={{ fontSize: 16, fontWeight: 600, color: T.fg, marginBottom: 8, fontFamily: T.font }}>{title}</h3>
                <p style={{ fontSize: 13, color: T.mutedFg, marginBottom: 24, lineHeight: 1.65 }}>{message}</p>
                <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
                    <button onClick={onClose}
                        style={{ padding: "8px 16px", background: "none", border: `1px solid ${T.border}`, color: T.mutedFg, borderRadius: 6, fontSize: 13, cursor: "pointer", fontFamily: T.font, transition: "background .12s" }}
                        onMouseEnter={(e) => e.currentTarget.style.background = T.muted}
                        onMouseLeave={(e) => e.currentTarget.style.background = "none"}>
                        Cancel
                    </button>
                    <button onClick={onConfirm}
                        style={{ padding: "8px 18px", background: danger ? "#ef4444" : T.primary, border: "none", color: danger ? "#fff" : T.primFg, borderRadius: 6, fontSize: 13, fontWeight: 600, cursor: "pointer", fontFamily: T.font, transition: "opacity .15s" }}
                        onMouseEnter={(e) => e.currentTarget.style.opacity = ".88"}
                        onMouseLeave={(e) => e.currentTarget.style.opacity = "1"}>
                        {confirmLabel}
                    </button>
                </div>
            </div>
        </div>
    );
}

// ─── Profile dropdown ─────────────────────────────────────────────────────────
function ProfileDropdown({ user, open, onClose, onLogout, navigate }) {
    const ref = useRef(null);
    useEffect(() => {
        if (!open) return;
        const h = (e) => { if (!ref.current?.contains(e.target)) onClose(); };
        document.addEventListener("mousedown", h);
        return () => document.removeEventListener("mousedown", h);
    }, [open, onClose]);
    if (!open) return null;
    return (
        <div ref={ref} style={{ position: "absolute", right: 0, top: 44, width: 220, background: T.surface, border: `1px solid ${T.border}`, borderRadius: 8, overflow: "hidden", zIndex: 50, boxShadow: "0 8px 30px rgba(0,0,0,.5)" }}>
            <div style={{ padding: "12px 16px", borderBottom: `1px solid ${T.border}`, display: "flex", alignItems: "center", gap: 10 }}>
                <div style={{ width: 32, height: 32, borderRadius: "50%", background: `linear-gradient(135deg,${T.primary},#16a34a)`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 11, fontWeight: 700, color: T.primFg, flexShrink: 0 }}>
                    {userInitials(user?.name)}
                </div>
                <div style={{ minWidth: 0 }}>
                    <div style={{ fontSize: 13, fontWeight: 500, color: T.fg, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{user?.name}</div>
                    <div style={{ fontSize: 11, color: T.mutedFg, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{user?.email}</div>
                </div>
            </div>
            <div style={{ padding: "4px 0" }}>
                <button onClick={() => { navigate("/settings"); onClose(); }}
                    style={{ width: "100%", display: "flex", alignItems: "center", gap: 12, padding: "10px 16px", background: "none", border: "none", color: T.mutedFg, fontSize: 13, cursor: "pointer", textAlign: "left", fontFamily: T.font }}
                    onMouseEnter={(e) => { e.currentTarget.style.background = T.muted; e.currentTarget.style.color = T.fg; }}
                    onMouseLeave={(e) => { e.currentTarget.style.background = "none"; e.currentTarget.style.color = T.mutedFg; }}>
                    <Icons.Settings size={14} /> Account Settings
                </button>
            </div>
            <div style={{ borderTop: `1px solid ${T.border}`, padding: "4px 0" }}>
                <button onClick={() => { onLogout(); onClose(); navigate("/auth"); }}
                    style={{ width: "100%", display: "flex", alignItems: "center", gap: 12, padding: "10px 16px", background: "none", border: "none", color: "#ef4444", fontSize: 13, cursor: "pointer", textAlign: "left", fontFamily: T.font }}
                    onMouseEnter={(e) => e.currentTarget.style.background = "rgba(239,68,68,.08)"}
                    onMouseLeave={(e) => e.currentTarget.style.background = "none"}>
                    <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.8" strokeLinecap="round" strokeLinejoin="round"><path d="m16 17 5-5-5-5m5 5H9m0 9H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" /></svg>
                    Sign out
                </button>
            </div>
        </div>
    );
}

// ─── Table row ────────────────────────────────────────────────────────────────
function TrashRow({ doc, index, onRestore, onDelete }) {
    const [hov, setHov] = useState(false);
    const [restoreHov, setRestoreHov] = useState(false);
    const [deleteHov, setDeleteHov] = useState(false);

    const cat = inferCategory(doc.title ?? "");
    const catColor = CAT_COLORS[cat] ?? CAT_COLORS.General;
    const iconColor = CAT_ICON_COLOR[cat] ?? "#7a7a7a";

    return (
        <div
            onMouseEnter={() => setHov(true)}
            onMouseLeave={() => setHov(false)}
            style={{
                display: "grid",
                gridTemplateColumns: "1fr 130px 170px 180px 32px 32px",
                alignItems: "center", gap: 16, padding: "13px 24px",
                borderBottom: `1px solid ${T.border}`,
                background: hov ? "#1f1f1f" : "transparent",
                transition: "background .12s",
            }}
        >
            {/* Title */}
            <div style={{ display: "flex", alignItems: "center", gap: 12, minWidth: 0 }}>
                <div style={{ width: 32, height: 32, background: catColor.bg, borderRadius: 7, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                    {ROW_ICONS[index % ROW_ICONS.length](iconColor)}
                </div>
                <span style={{ fontSize: 14, fontWeight: 500, color: hov ? T.fg : "#c0c0c0", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", transition: "color .12s" }}>
                    {doc.title ?? "Untitled Document"}
                </span>
            </div>

            {/* Tag */}
            <div>
                <span style={{ fontSize: 11, fontWeight: 600, padding: "3px 10px", borderRadius: 4, background: catColor.bg, color: catColor.text }}>
                    {cat}
                </span>
            </div>

            {/* Deleted by */}
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <div style={{ width: 22, height: 22, borderRadius: "50%", background: "rgba(122,122,122,.25)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 9, fontWeight: 700, color: T.mutedFg, flexShrink: 0 }}>
                    {userInitials(ownerName(doc.owner))}
                </div>
                <span style={{ fontSize: 13, color: T.mutedFg }}>
                    {ownerName(doc.owner)}
                </span>
            </div>

            {/* Deleted at */}
            <span style={{ fontSize: 13, color: T.mutedFg, whiteSpace: "nowrap" }}>
                {fmtDate(doc.updatedAt ?? doc.createdAt)}
            </span>

            {/* Restore button */}
            <button
                title="Restore document"
                onClick={() => onRestore(doc)}
                onMouseEnter={() => setRestoreHov(true)}
                onMouseLeave={() => setRestoreHov(false)}
                style={{ width: 28, height: 28, background: restoreHov ? "rgba(61,220,110,.1)" : "none", border: "none", borderRadius: 5, display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", transition: "all .15s" }}
            >
                <RestoreIcon color={restoreHov ? T.primary : T.mutedFg} />
            </button>

            {/* Permanent delete button */}
            <button
                title="Delete permanently"
                onClick={() => onDelete(doc)}
                onMouseEnter={() => setDeleteHov(true)}
                onMouseLeave={() => setDeleteHov(false)}
                style={{ width: 28, height: 28, background: deleteHov ? "rgba(239,68,68,.1)" : "none", border: "none", borderRadius: 5, display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", transition: "all .15s" }}
            >
                <svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke={deleteHov ? "#ef4444" : T.mutedFg} strokeWidth="2.8" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M18 6 6 18M6 6l12 12" />
                </svg>
            </button>
        </div>
    );
}

// ─── ROOT: TrashPage ─────────────────────────────────────────────────────────
export default function TrashPage() {
    const navigate = useNavigate();
    const { toast } = useToast();
    const user = useAuthStore((s) => s.user);
    const logout = useAuthStore((s) => s.logout);

    const [documents, setDocuments] = useState([]);
    const [loading, setLoading] = useState(false);
    const [search, setSearch] = useState("");
    const [profileOpen, setProfileOpen] = useState(false);
    const [deleteTarget, setDeleteTarget] = useState(null);   // single doc confirm
    const [emptyConfirm, setEmptyConfirm] = useState(false);  // empty trash confirm

    // Load archived/deleted docs
    useEffect(() => {
        setLoading(true);
        // Uses Archived status as proxy for trash; swap for status:"Deleted" once backend supports it
        api.get("/documents", { params: { filter: "all" } })
            .then(({ data }) => {
                const trashed = (data?.documents ?? []).filter((d) => d.status === "Archived");
                setDocuments(trashed);
            })
            .catch(() => { })
            .finally(() => setLoading(false));
    }, []);

    const filtered = useMemo(() => {
        if (!search.trim()) return documents;
        const q = search.toLowerCase();
        return documents.filter((d) => (d.title ?? "").toLowerCase().includes(q));
    }, [documents, search]);

    // ── Restore ────────────────────────────────────────────────────────────────
    const handleRestore = useCallback(async (doc) => {
        try {
            await api.patch(`/documents/${docPk(doc)}`, { status: "Active" });
            setDocuments((prev) => prev.filter((d) => docPk(d) !== docPk(doc)));
            toast.success(`"${doc.title ?? "Document"}" restored to My Documents`);
        } catch { toast.error("Failed to restore document"); }
    }, [toast]);

    // ── Permanent delete single ────────────────────────────────────────────────
    const handleDeleteConfirm = useCallback(async () => {
        if (!deleteTarget) return;
        try {
            await api.delete(`/documents/${docPk(deleteTarget)}`);
            setDocuments((prev) => prev.filter((d) => docPk(d) !== docPk(deleteTarget)));
            toast.success("Document permanently deleted");
        } catch { toast.error("Failed to delete document"); }
        finally { setDeleteTarget(null); }
    }, [deleteTarget, toast]);

    // ── Empty trash ────────────────────────────────────────────────────────────
    const handleEmptyTrash = useCallback(async () => {
        setEmptyConfirm(false);
        try {
            await Promise.all(documents.map((d) => api.delete(`/documents/${docPk(d)}`)));
            setDocuments([]);
            toast.success("Trash emptied");
        } catch { toast.error("Failed to empty trash"); }
    }, [documents, toast]);

    return (
        <div style={{ display: "flex", minHeight: "100vh", background: T.bg, fontFamily: T.font, color: T.fg }}>
            <Sidebar activeTab="trash" onNewDoc={() => navigate("/documents")} />

            <main style={{ flex: 1, padding: "40px 48px", overflowY: "auto" }}>

                {/* ── Top bar ──────────────────────────────────────────────────── */}
                <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: 32 }}>
                    <div>
                        <p style={{ fontSize: 11, fontWeight: 600, color: T.primary, textTransform: "uppercase", letterSpacing: "0.12em", marginBottom: 6 }}>
                            TRASH
                        </p>
                        <h1 style={{ fontSize: 30, fontWeight: 600, color: T.fg, letterSpacing: "-.025em", fontFamily: T.font, marginBottom: 4 }}>
                            Deleted Documents
                        </h1>
                        <p style={{ fontSize: 13, color: T.mutedFg }}>
                            Items in trash are permanently deleted after 30 days.
                        </p>
                    </div>

                    <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                        {/* Search */}
                        <div style={{ display: "flex", alignItems: "center", gap: 8, background: T.surface, border: `1px solid ${T.border}`, borderRadius: 6, padding: "8px 12px", width: 220 }}>
                            <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={T.mutedFg} strokeWidth="2.8" strokeLinecap="round" strokeLinejoin="round"><path d="m21 21-4.34-4.34" /><circle cx="11" cy="11" r="8" /></svg>
                            <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search trash..."
                                style={{ background: "none", border: "none", outline: "none", color: T.fg, fontSize: 13, fontFamily: T.font, width: "100%" }} />
                        </div>

                        {/* Bell */}
                        <div style={{ width: 36, height: 36, background: T.surface, border: `1px solid ${T.border}`, borderRadius: 6, display: "flex", alignItems: "center", justifyContent: "center", color: T.mutedFg, position: "relative", cursor: "pointer" }}>
                            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round"><path d="M10.268 21a2 2 0 0 0 3.464 0m-10.47-5.674A1 1 0 0 0 4 17h16a1 1 0 0 0 .74-1.673C19.41 13.956 18 12.499 18 8A6 6 0 0 0 6 8c0 4.499-1.411 5.956-2.738 7.326" /></svg>
                            <div style={{ position: "absolute", top: 8, right: 8, width: 6, height: 6, background: T.primary, borderRadius: "50%" }} />
                        </div>

                        {/* Avatar */}
                        <div style={{ position: "relative" }}>
                            <button onClick={() => setProfileOpen(o => !o)}
                                style={{ width: 36, height: 36, borderRadius: "50%", background: `linear-gradient(135deg,${T.primary},#16a34a)`, border: `2px solid ${T.primary}`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 12, fontWeight: 700, color: T.primFg, cursor: "pointer" }}>
                                {userInitials(user?.name)}
                            </button>
                            <ProfileDropdown user={user} open={profileOpen} onClose={() => setProfileOpen(false)} onLogout={logout} navigate={navigate} />
                        </div>

                        {/* Empty Trash button */}
                        <button
                            onClick={() => documents.length > 0 && setEmptyConfirm(true)}
                            disabled={documents.length === 0}
                            style={{
                                display: "flex", alignItems: "center", gap: 8,
                                padding: "8px 16px", borderRadius: 6, fontSize: 13, fontWeight: 500,
                                background: T.muted, color: documents.length > 0 ? T.mutedFg : "#444",
                                border: `1px solid ${T.border}`, cursor: documents.length > 0 ? "pointer" : "not-allowed",
                                fontFamily: T.font, transition: "all .15s",
                            }}
                            onMouseEnter={(e) => { if (documents.length > 0) { e.currentTarget.style.background = "#333"; e.currentTarget.style.color = T.fg; } }}
                            onMouseLeave={(e) => { e.currentTarget.style.background = T.muted; e.currentTarget.style.color = documents.length > 0 ? T.mutedFg : "#444"; }}
                        >
                            <Icons.Trash />
                            Empty Trash
                        </button>
                    </div>
                </div>

                {/* ── Table ────────────────────────────────────────────────────── */}
                <div style={{ background: T.surface, borderRadius: 10, border: `1px solid ${T.border}`, overflow: "hidden", marginBottom: 16 }}>

                    {/* Header */}
                    <div style={{ display: "grid", gridTemplateColumns: "1fr 130px 170px 180px 32px 32px", gap: 16, padding: "12px 24px", borderBottom: `1px solid ${T.border}` }}>
                        {["TITLE", "TAG", "DELETED BY", "DELETED AT", "", ""].map((h, i) => (
                            <span key={i} style={{ fontSize: 11, fontWeight: 500, color: T.mutedFg, textTransform: "uppercase", letterSpacing: "0.08em" }}>{h}</span>
                        ))}
                    </div>

                    {/* Rows */}
                    {loading ? (
                        <div style={{ display: "flex", justifyContent: "center", padding: "60px 0" }}>
                            <svg style={{ animation: "spin .8s linear infinite", width: 22, height: 22, color: T.primary }} viewBox="0 0 24 24" fill="none">
                                <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" style={{ opacity: .25 }} />
                                <path fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" style={{ opacity: .75 }} />
                            </svg>
                        </div>
                    ) : filtered.length === 0 ? (
                        <div style={{ padding: "80px 24px", textAlign: "center" }}>
                            <div style={{ width: 48, height: 48, borderRadius: "50%", background: T.muted, display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 16px", color: T.mutedFg }}>
                                <Icons.Trash />
                            </div>
                            <p style={{ color: T.fg, fontSize: 15, fontWeight: 500, marginBottom: 6 }}>
                                {search ? "No matching documents" : "Trash is empty"}
                            </p>
                            <p style={{ color: T.mutedFg, fontSize: 13, lineHeight: 1.6 }}>
                                {search ? "Try adjusting your search." : "Deleted documents will appear here for 30 days before being permanently removed."}
                            </p>
                        </div>
                    ) : (
                        filtered.map((doc, i) => (
                            <TrashRow key={docPk(doc)} doc={doc} index={i}
                                onRestore={handleRestore}
                                onDelete={(d) => setDeleteTarget(d)}
                            />
                        ))
                    )}
                </div>

                {/* ── Info bar ─────────────────────────────────────────────────── */}
                {filtered.length > 0 && (
                    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                        <svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke={T.mutedFg} strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
                            <circle cx="12" cy="12" r="10" /><path d="M12 16v-4m0-4h.01" />
                        </svg>
                        <p style={{ fontSize: 12, color: T.mutedFg }}>
                            Restoring a document will move it back to My Documents.
                        </p>
                    </div>
                )}
            </main>

            {/* ── Single delete confirm modal ───────────────────────────────── */}
            {deleteTarget && (
                <ConfirmModal
                    title="Delete permanently?"
                    message={<>Are you sure you want to permanently delete <strong style={{ color: T.fg }}>"{deleteTarget.title ?? "Untitled"}"</strong>? This action cannot be undone.</>}
                    confirmLabel="Delete permanently"
                    onConfirm={handleDeleteConfirm}
                    onClose={() => setDeleteTarget(null)}
                />
            )}

            {/* ── Empty trash confirm modal ─────────────────────────────────── */}
            {emptyConfirm && (
                <ConfirmModal
                    title="Empty trash?"
                    message={`This will permanently delete all ${documents.length} document${documents.length !== 1 ? "s" : ""} in trash. This action cannot be undone.`}
                    confirmLabel="Empty trash"
                    onConfirm={handleEmptyTrash}
                    onClose={() => setEmptyConfirm(false)}
                />
            )}

            <style>{`
        @keyframes spin { to { transform:rotate(360deg); } }
        input::placeholder { color:${T.mutedFg}; }
      `}</style>
        </div>
    );
}