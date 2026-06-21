/**
 * pages/ArchivePage.jsx
 * ─────────────────────────────────────────────────────────────────────────────
 * Archived Documents page converted from Stitch HTML output.
 *
 * Key differences from TrashPage:
 *  - Info banner at the TOP (not bottom)
 *  - "Archived On" date shows "Archived Mar 15" format
 *  - AUTHOR column (not "Deleted by")
 *  - Three-dot context menu per row (Open, Restore, Delete)
 *  - Bottom center: "Restore all" (green outlined) + "Delete all permanently"
 *  - No individual restore/delete icon buttons on rows
 *
 * API:
 *  GET  /api/documents?filter=archived  → loads archived docs
 *  PATCH /api/documents/:id { status:"Active" }  → restore
 *  DELETE /api/documents/:id  → permanent delete
 */

import { useState, useEffect, useCallback, useRef, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { useToast } from "../components/UI/Toast";
import { useAuthStore } from "../store/authSlice";
import Sidebar, { T, Icons } from "../components/Layout/Sidebar";
import api from "../services/api";

// ─── Category tag colors (same across all pages) ──────────────────────────────
const CAT = {
    General: { bg: "rgba(122,122,122,.12)", text: "#7a7a7a" },
    Product: { bg: "rgba(61,220,110,.13)", text: "#3ddc6e" },
    Design: { bg: "rgba(224,92,42,.13)", text: "#e05c2a" },
    Engineering: { bg: "rgba(42,122,224,.13)", text: "#2a7ae0" },
    Research: { bg: "rgba(200,168,0,.13)", text: "#c8a800" },
    Finance: { bg: "rgba(139,42,224,.13)", text: "#8b2ae0" },
    Marketing: { bg: "rgba(224,42,106,.13)", text: "#e02a6a" },
};

const CAT_ICON = {
    General: "#7a7a7a",
    Product: "#3ddc6e",
    Design: "#e05c2a",
    Engineering: "#2a7ae0",
    Research: "#c8a800",
    Finance: "#8b2ae0",
    Marketing: "#e02a6a",
};

// ─── Helpers ──────────────────────────────────────────────────────────────────
function docPk(d) { return d?._id ?? d?.id ?? ""; }
function ownerName(o) { if (!o) return "You"; return typeof o === "object" ? (o.name ?? o.email ?? "You") : String(o); }
function initials(n) { if (!n) return "?"; return n.split(" ").map(x => x[0]).join("").toUpperCase().slice(0, 2); }

function fmtArchived(d) {
    if (!d) return "—";
    return "Archived " + new Date(d).toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

function inferCategory(t = "") {
    const s = t.toLowerCase();
    if (s.includes("design") || s.includes("brand") || s.includes("onboard") || s.includes("ui")) return "Design";
    if (s.includes("engineer") || s.includes("api") || s.includes("code") || s.includes("sprint")) return "Engineering";
    if (s.includes("research") || s.includes("survey") || s.includes("user")) return "Research";
    if (s.includes("market") || s.includes("copy") || s.includes("campaign")) return "Marketing";
    if (s.includes("finance") || s.includes("investor") || s.includes("budget")) return "Finance";
    if (s.includes("product") || s.includes("roadmap") || s.includes("okr")) return "Product";
    return "General";
}

// ─── Row icons ────────────────────────────────────────────────────────────────
const ROW_ICONS = [
    (c) => <svg xmlns="http://www.w3.org/2000/svg" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M14.106 5.553a2 2 0 0 0 1.788 0l3.659-1.83A1 1 0 0 1 21 4.619v12.764a1 1 0 0 1-.553.894l-4.553 2.277a2 2 0 0 1-1.788 0l-4.212-2.106a2 2 0 0 0-1.788 0l-3.659 1.83A1 1 0 0 1 3 19.381V6.618a1 1 0 0 1 .553-.894l4.553-2.277a2 2 0 0 1 1.788 0zm.894.211v15M9 3.236v15" /></svg>,
    (c) => <svg xmlns="http://www.w3.org/2000/svg" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M6 22a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h8a2.4 2.4 0 0 1 1.704.706l3.588 3.588A2.4 2.4 0 0 1 20 8v12a2 2 0 0 1-2 2z" /><path d="M14 2v5a1 1 0 0 0 1 1h5" /></svg>,
    (c) => <svg xmlns="http://www.w3.org/2000/svg" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="m18 16 4-4-4-4M6 8l-4 4 4 4m8.5-12-5 16" /></svg>,
    (c) => <svg xmlns="http://www.w3.org/2000/svg" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><rect width="8" height="4" x="8" y="2" rx="1" /><path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2" /><path d="M12 11h4m-4 4h4m-8-4h.01M8 15h.01" /></svg>,
    (c) => <svg xmlns="http://www.w3.org/2000/svg" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M2 3h20m-1 0v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V3" /><path d="m7 21 5-5 5 5" /></svg>,
    (c) => <svg xmlns="http://www.w3.org/2000/svg" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" /></svg>,
];

// ─── Restore icon ─────────────────────────────────────────────────────────────
const RestoreIcon = ({ size = 14, color = "currentColor" }) => (
    <svg xmlns="http://www.w3.org/2000/svg" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round">
        <path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" />
        <path d="M3 3v5h5" />
    </svg>
);

// ─── Context menu (three-dot) ─────────────────────────────────────────────────
function RowMenu({ doc, onClose, onOpen, onRestore, onDelete }) {
    const ref = useRef(null);
    const { toast } = useToast();

    useEffect(() => {
        const h = (e) => { if (!ref.current?.contains(e.target)) onClose(); };
        document.addEventListener("mousedown", h);
        return () => document.removeEventListener("mousedown", h);
    }, [onClose]);

    const copyLink = () => {
        navigator.clipboard.writeText(`${window.location.origin}/editor/${docPk(doc)}`)
            .then(() => toast.success("Link copied!"));
        onClose();
    };

    const items = [
        { icon: "open_in_new", label: "Open", action: () => { onOpen(doc); onClose(); } },
        { icon: "restore", label: "Restore", action: () => { onRestore(doc); onClose(); }, green: true },
        { icon: "link", label: "Copy link", action: copyLink },
        { divider: true },
        { icon: "delete", label: "Delete permanently", action: () => { onDelete(doc); onClose(); }, danger: true },
    ];

    return (
        <div ref={ref} style={{
            position: "absolute", right: 0, top: 28, width: 195, zIndex: 100,
            background: T.surface, border: `1px solid ${T.border}`,
            borderRadius: 8, overflow: "hidden",
            boxShadow: "0 8px 24px rgba(0,0,0,.6)",
        }}>
            {items.map((item, i) =>
                item.divider
                    ? <div key={i} style={{ borderTop: `1px solid ${T.border}` }} />
                    : (
                        <button key={item.label} onClick={item.action}
                            style={{
                                width: "100%", display: "flex", alignItems: "center", gap: 10,
                                padding: "9px 14px", background: "none", border: "none",
                                color: item.danger ? "#ef4444" : item.green ? T.primary : T.fg,
                                fontSize: 13, cursor: "pointer", textAlign: "left",
                                fontFamily: T.font, transition: "background .12s",
                            }}
                            onMouseEnter={(e) => e.currentTarget.style.background = item.danger ? "rgba(239,68,68,.08)" : item.green ? "rgba(34,197,94,.06)" : T.muted}
                            onMouseLeave={(e) => e.currentTarget.style.background = "none"}
                        >
                            <span className="material-symbols-outlined" style={{ fontSize: 15, color: item.danger ? "#ef4444" : item.green ? T.primary : T.mutedFg }}>
                                {item.icon}
                            </span>
                            {item.label}
                        </button>
                    )
            )}
        </div>
    );
}

// ─── Confirm modal ────────────────────────────────────────────────────────────
function ConfirmModal({ title, message, confirmLabel, onConfirm, onClose, danger = true }) {
    return (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,.65)", zIndex: 200, display: "flex", alignItems: "center", justifyContent: "center" }}
            onClick={onClose}>
            <div onClick={(e) => e.stopPropagation()}
                style={{ background: T.surface, border: `1px solid ${T.border}`, borderRadius: 10, padding: 28, width: 420, boxShadow: "0 20px 60px rgba(0,0,0,.6)" }}>
                <h3 style={{ fontSize: 16, fontWeight: 600, color: T.fg, marginBottom: 8, fontFamily: T.font }}>{title}</h3>
                <p style={{ fontSize: 13, color: T.mutedFg, marginBottom: 24, lineHeight: 1.65 }}>{message}</p>
                <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
                    <button onClick={onClose}
                        style={{ padding: "8px 16px", background: "none", border: `1px solid ${T.border}`, color: T.mutedFg, borderRadius: 6, fontSize: 13, cursor: "pointer", fontFamily: T.font }}
                        onMouseEnter={(e) => e.currentTarget.style.background = T.muted}
                        onMouseLeave={(e) => e.currentTarget.style.background = "none"}>
                        Cancel
                    </button>
                    <button onClick={onConfirm}
                        style={{ padding: "8px 18px", background: danger ? "#ef4444" : T.primary, border: "none", color: danger ? "#fff" : T.primFg, borderRadius: 6, fontSize: 13, fontWeight: 600, cursor: "pointer", fontFamily: T.font }}
                        onMouseEnter={(e) => e.currentTarget.style.opacity = ".88"}
                        onMouseLeave={(e) => e.currentTarget.style.opacity = "1"}>
                        {confirmLabel}
                    </button>
                </div>
            </div>
        </div>
    );
}

// ─── Table row ────────────────────────────────────────────────────────────────
function ArchiveRow({ doc, index, onOpen, onRestore, onDelete }) {
    const [hov, setHov] = useState(false);
    const [menu, setMenu] = useState(false);
    const cat = inferCategory(doc.title ?? "");
    const catColor = CAT[cat] ?? CAT.General;
    const iconColor = CAT_ICON[cat] ?? "#7a7a7a";

    return (
        <div
            onMouseEnter={() => setHov(true)}
            onMouseLeave={() => setHov(false)}
            style={{
                display: "grid",
                gridTemplateColumns: "1fr 140px 180px 160px 36px",
                alignItems: "center", gap: 16, padding: "14px 24px",
                borderBottom: `1px solid ${T.border}`,
                background: hov ? "#1f1f1f" : "transparent",
                transition: "background .12s", cursor: "pointer",
            }}
            onClick={() => onOpen(doc)}
        >
            {/* Title */}
            <div style={{ display: "flex", alignItems: "center", gap: 12, minWidth: 0 }}>
                <div style={{ width: 34, height: 34, background: catColor.bg, borderRadius: 7, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                    {ROW_ICONS[index % ROW_ICONS.length](iconColor)}
                </div>
                <span style={{ fontSize: 14, fontWeight: 500, color: T.fg, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {doc.title ?? "Untitled Document"}
                </span>
            </div>

            {/* Tag */}
            <div>
                <span style={{ fontSize: 11, fontWeight: 600, padding: "3px 10px", borderRadius: 4, background: catColor.bg, color: catColor.text }}>
                    {cat}
                </span>
            </div>

            {/* Author */}
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <div style={{ width: 22, height: 22, borderRadius: "50%", background: `linear-gradient(135deg,${T.primary},#16a34a)`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 9, fontWeight: 700, color: T.primFg, flexShrink: 0 }}>
                    {initials(ownerName(doc.owner))}
                </div>
                <span style={{ fontSize: 13, color: T.mutedFg, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {ownerName(doc.owner)}
                </span>
            </div>

            {/* Archived on */}
            <span style={{ fontSize: 13, color: T.mutedFg, whiteSpace: "nowrap" }}>
                {fmtArchived(doc.updatedAt ?? doc.createdAt)}
            </span>

            {/* Three-dot */}
            <div style={{ position: "relative" }} onClick={(e) => e.stopPropagation()}>
                <button
                    onClick={() => setMenu((o) => !o)}
                    style={{ width: 28, height: 28, background: menu ? T.muted : "none", border: "none", borderRadius: 5, display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", color: hov || menu ? T.mutedFg : "transparent", transition: "all .15s" }}>
                    <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.8" strokeLinecap="round" strokeLinejoin="round">
                        <circle cx="12" cy="5" r="1" /><circle cx="12" cy="12" r="1" /><circle cx="12" cy="19" r="1" />
                    </svg>
                </button>
                {menu && (
                    <RowMenu doc={doc} onClose={() => setMenu(false)} onOpen={onOpen} onRestore={onRestore} onDelete={onDelete} />
                )}
            </div>
        </div>
    );
}

// ─── ROOT: ArchivePage ────────────────────────────────────────────────────────
export default function ArchivePage() {
    const navigate = useNavigate();
    const { toast } = useToast();
    const user = useAuthStore((s) => s.user);
    const logout = useAuthStore((s) => s.logout);

    const [documents, setDocuments] = useState([]);
    const [loading, setLoading] = useState(false);
    const [search, setSearch] = useState("");
    const [deleteTarget, setDeleteTarget] = useState(null);
    const [deleteAllOpen, setDeleteAllOpen] = useState(false);
    const [restoreAllOpen, setRestoreAllOpen] = useState(false);

    // Load archived docs
    useEffect(() => {
        setLoading(true);
        api.get("/documents", { params: { filter: "all" } })
            .then(({ data }) => {
                const archived = (data?.documents ?? []).filter((d) => d.status === "Archived");
                setDocuments(archived);
            })
            .catch(() => { })
            .finally(() => setLoading(false));
    }, []);

    const filtered = useMemo(() => {
        if (!search.trim()) return documents;
        const q = search.toLowerCase();
        return documents.filter((d) => (d.title ?? "").toLowerCase().includes(q));
    }, [documents, search]);

    // ── Single restore ─────────────────────────────────────────────────────────
    const handleRestore = useCallback(async (doc) => {
        try {
            await api.patch(`/documents/${docPk(doc)}`, { status: "Active" });
            setDocuments((prev) => prev.filter((d) => docPk(d) !== docPk(doc)));
            toast.success(`"${doc.title ?? "Document"}" restored to My Documents`);
        } catch { toast.error("Failed to restore document"); }
    }, [toast]);

    // ── Restore all ────────────────────────────────────────────────────────────
    const handleRestoreAll = useCallback(async () => {
        setRestoreAllOpen(false);
        try {
            await Promise.all(documents.map((d) => api.patch(`/documents/${docPk(d)}`, { status: "Active" })));
            setDocuments([]);
            toast.success(`${documents.length} document${documents.length !== 1 ? "s" : ""} restored`);
        } catch { toast.error("Failed to restore all documents"); }
    }, [documents, toast]);

    // ── Single delete ──────────────────────────────────────────────────────────
    const handleDeleteConfirm = useCallback(async () => {
        if (!deleteTarget) return;
        try {
            await api.delete(`/documents/${docPk(deleteTarget)}`);
            setDocuments((prev) => prev.filter((d) => docPk(d) !== docPk(deleteTarget)));
            toast.success("Document permanently deleted");
        } catch { toast.error("Failed to delete document"); }
        finally { setDeleteTarget(null); }
    }, [deleteTarget, toast]);

    // ── Delete all permanently ─────────────────────────────────────────────────
    const handleDeleteAll = useCallback(async () => {
        setDeleteAllOpen(false);
        try {
            await Promise.all(documents.map((d) => api.delete(`/documents/${docPk(d)}`)));
            setDocuments([]);
            toast.success("All archived documents permanently deleted");
        } catch { toast.error("Failed to delete all documents"); }
    }, [documents, toast]);

    const handleOpen = useCallback((doc) => navigate(`/editor/${docPk(doc)}`), [navigate]);

    return (
        <div style={{ display: "flex", minHeight: "100vh", background: T.bg, fontFamily: T.font, color: T.fg }}>
            <Sidebar activeTab="archive" onNewDoc={() => navigate("/new")} />

            <main style={{ flex: 1, padding: "40px 48px", overflowY: "auto" }}>

                {/* ── Header row ────────────────────────────────────────────────── */}
                <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: 28 }}>
                    <div>
                        <p style={{ fontSize: 11, fontWeight: 600, color: T.primary, textTransform: "uppercase", letterSpacing: "0.12em", marginBottom: 6 }}>
                            ARCHIVE
                        </p>
                        <h1 style={{ fontSize: 30, fontWeight: 600, color: T.fg, letterSpacing: "-.025em", fontFamily: T.font }}>
                            Archived Documents
                        </h1>
                    </div>

                    {/* Search */}
                    <div style={{ display: "flex", alignItems: "center", gap: 8, background: T.surface, border: `1px solid ${T.border}`, borderRadius: 6, padding: "8px 12px", width: 240 }}>
                        <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={T.mutedFg} strokeWidth="2.8" strokeLinecap="round" strokeLinejoin="round"><path d="m21 21-4.34-4.34" /><circle cx="11" cy="11" r="8" /></svg>
                        <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search archive..."
                            style={{ background: "none", border: "none", outline: "none", color: T.fg, fontSize: 13, fontFamily: T.font, width: "100%" }} />
                    </div>
                </div>

                {/* ── Info banner ───────────────────────────────────────────────── */}
                <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "12px 16px", background: "rgba(255,255,255,.03)", border: `1px solid ${T.border}`, borderRadius: 8, marginBottom: 28 }}>
                    <svg xmlns="http://www.w3.org/2000/svg" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke={T.mutedFg} strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}>
                        <circle cx="12" cy="12" r="10" /><path d="M12 16v-4m0-4h.01" />
                    </svg>
                    <span style={{ fontSize: 13, color: T.mutedFg, lineHeight: 1.5 }}>
                        Archived documents are hidden from your main view. You can restore or permanently delete them at any time.
                    </span>
                </div>

                {/* ── Table ────────────────────────────────────────────────────── */}
                <div style={{ background: T.surface, borderRadius: 10, border: `1px solid ${T.border}`, overflow: "hidden", marginBottom: 32 }}>

                    {/* Header */}
                    <div style={{ display: "grid", gridTemplateColumns: "1fr 140px 180px 160px 36px", gap: 16, padding: "12px 24px", borderBottom: `1px solid ${T.border}` }}>
                        {["TITLE", "TAG", "AUTHOR", "ARCHIVED ON", ""].map((h, i) => (
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
                                <Icons.Archive />
                            </div>
                            <p style={{ color: T.fg, fontSize: 15, fontWeight: 500, marginBottom: 6 }}>
                                {search ? "No matching documents" : "Archive is empty"}
                            </p>
                            <p style={{ color: T.mutedFg, fontSize: 13, lineHeight: 1.6 }}>
                                {search ? "Try adjusting your search." : "Archived documents will appear here."}
                            </p>
                        </div>
                    ) : (
                        filtered.map((doc, i) => (
                            <ArchiveRow key={docPk(doc)} doc={doc} index={i}
                                onOpen={handleOpen}
                                onRestore={handleRestore}
                                onDelete={(d) => setDeleteTarget(d)}
                            />
                        ))
                    )}
                </div>

                {/* ── Bottom action buttons ─────────────────────────────────────── */}
                {documents.length > 0 && (
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 12 }}>

                        {/* Restore all */}
                        <button
                            onClick={() => setRestoreAllOpen(true)}
                            style={{
                                display: "flex", alignItems: "center", gap: 8,
                                padding: "9px 20px", borderRadius: 8, fontSize: 13, fontWeight: 500,
                                background: "transparent",
                                border: `1px solid ${T.primary}`,
                                color: T.primary, cursor: "pointer", fontFamily: T.font,
                                transition: "all .15s",
                            }}
                            onMouseEnter={(e) => { e.currentTarget.style.background = "rgba(34,197,94,.08)"; }}
                            onMouseLeave={(e) => { e.currentTarget.style.background = "transparent"; }}
                        >
                            <RestoreIcon size={14} color={T.primary} />
                            Restore all
                        </button>

                        {/* Delete all permanently */}
                        <button
                            onClick={() => setDeleteAllOpen(true)}
                            style={{
                                display: "flex", alignItems: "center", gap: 8,
                                padding: "9px 20px", borderRadius: 8, fontSize: 13, fontWeight: 500,
                                background: "transparent", border: `1px solid ${T.border}`,
                                color: T.mutedFg, cursor: "pointer", fontFamily: T.font,
                                transition: "all .15s",
                            }}
                            onMouseEnter={(e) => { e.currentTarget.style.borderColor = "#ef4444"; e.currentTarget.style.color = "#ef4444"; e.currentTarget.style.background = "rgba(239,68,68,.06)"; }}
                            onMouseLeave={(e) => { e.currentTarget.style.borderColor = T.border; e.currentTarget.style.color = T.mutedFg; e.currentTarget.style.background = "transparent"; }}
                        >
                            <Icons.Trash />
                            Delete all permanently
                        </button>
                    </div>
                )}
            </main>

            {/* ── Modals ───────────────────────────────────────────────────────── */}
            {deleteTarget && (
                <ConfirmModal
                    title="Delete permanently?"
                    message={<>This will permanently delete <strong style={{ color: T.fg }}>"{deleteTarget.title ?? "Untitled"}"</strong>. This cannot be undone.</>}
                    confirmLabel="Delete permanently"
                    onConfirm={handleDeleteConfirm}
                    onClose={() => setDeleteTarget(null)}
                />
            )}

            {deleteAllOpen && (
                <ConfirmModal
                    title="Delete all permanently?"
                    message={`This will permanently delete all ${documents.length} archived document${documents.length !== 1 ? "s" : ""}. This cannot be undone.`}
                    confirmLabel="Delete all"
                    onConfirm={handleDeleteAll}
                    onClose={() => setDeleteAllOpen(false)}
                />
            )}

            {restoreAllOpen && (
                <ConfirmModal
                    title="Restore all documents?"
                    message={`This will restore all ${documents.length} archived document${documents.length !== 1 ? "s" : ""} back to My Documents.`}
                    confirmLabel="Restore all"
                    onConfirm={handleRestoreAll}
                    onClose={() => setRestoreAllOpen(false)}
                    danger={false}
                />
            )}

            <style>{`
        @keyframes spin { to { transform:rotate(360deg); } }
        input::placeholder { color:${T.mutedFg}; }
      `}</style>
        </div>
    );
}