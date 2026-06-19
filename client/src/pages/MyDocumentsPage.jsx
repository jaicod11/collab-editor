/**
 * pages/MyDocumentsPage.jsx
 * ─────────────────────────────────────────────────────────────────────────────
 * "My Documents" list/table view converted from Stitch output.
 *
 * Features:
 *   - Category filter pills (All, Product, Design, Engineering, Research, Finance, Marketing)
 *   - Sort by: Last edited, Created, Title, Author
 *   - List view (table rows) with icon, title, tag, author, date, three-dot menu
 *   - Three-dot context menu: Open, Rename, Duplicate, Copy Link, Archive, Delete
 *   - Search filtering
 *   - Profile dropdown (shared)
 *   - Real API wired via useDocument()
 */

import { useState, useEffect, useCallback, useRef, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { useDocument } from "../hooks/useDocument";
import { useToast } from "../components/UI/Toast";
import { useAuthStore } from "../store/authSlice";
import Sidebar, { T, Icons } from "../components/Layout/Sidebar";
import api from "../services/api";

// ─── Helpers ──────────────────────────────────────────────────────────────────
function docPk(doc) { return doc?._id ?? doc?.id ?? ""; }
function ownerName(o) { if (!o) return "Unknown"; return typeof o === "object" ? (o.name ?? o.email ?? "Unknown") : String(o); }
function userInitials(n) { if (!n) return "?"; return n.split(" ").map(x => x[0]).join("").toUpperCase().slice(0, 2); }

function fmtDate(d) {
    if (!d) return "—";
    const dt = new Date(d), now = new Date(), diff = now - dt;
    const hrs = Math.round(diff / 3600000);
    if (hrs < 1) return `${Math.round(diff / 60000)}m ago`;
    if (hrs < 24) return `Today at ${dt.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })}`;
    if (hrs < 48) return `Yesterday at ${dt.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })}`;
    return dt.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });
}

function inferCategory(t = "") {
    const s = t.toLowerCase();
    if (s.includes("design") || s.includes("brand") || s.includes("ui") || s.includes("onboard")) return "Design";
    if (s.includes("engineer") || s.includes("api") || s.includes("code") || s.includes("sprint")) return "Engineering";
    if (s.includes("research") || s.includes("survey") || s.includes("user")) return "Research";
    if (s.includes("market") || s.includes("copy") || s.includes("campaign")) return "Marketing";
    if (s.includes("finance") || s.includes("investor") || s.includes("budget")) return "Finance";
    return "Product";
}

const CATEGORIES = ["All", "Product", "Design", "Engineering", "Research", "Finance", "Marketing"];

const TAG_STYLE = (cat) => ({
    bg: ["Product", "Design"].includes(cat) ? T.sec : T.muted,
    text: ["Product", "Design"].includes(cat) ? T.primary : T.mutedFg,
});

// ─── Row icons (rotate through based on index) ────────────────────────────────
const ROW_ICONS = [
    <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.8" strokeLinecap="round" strokeLinejoin="round"><path d="M14.106 5.553a2 2 0 0 0 1.788 0l3.659-1.83A1 1 0 0 1 21 4.619v12.764a1 1 0 0 1-.553.894l-4.553 2.277a2 2 0 0 1-1.788 0l-4.212-2.106a2 2 0 0 0-1.788 0l-3.659 1.83A1 1 0 0 1 3 19.381V6.618a1 1 0 0 1 .553-.894l4.553-2.277a2 2 0 0 1 1.788 0zm.894.211v15M9 3.236v15" /></svg>,
    <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.8" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10" /><circle cx="12" cy="12" r="6" /><circle cx="12" cy="12" r="2" /></svg>,
    <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.8" strokeLinecap="round" strokeLinejoin="round"><path d="m18 16 4-4-4-4M6 8l-4 4 4 4m8.5-12-5 16" /></svg>,
    <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.8" strokeLinecap="round" strokeLinejoin="round"><path d="M6 22a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h8a2.4 2.4 0 0 1 1.704.706l3.588 3.588A2.4 2.4 0 0 1 20 8v12a2 2 0 0 1-2 2z" /><path d="M14 2v5a1 1 0 0 0 1 1h5M10 9H8m8 4H8m8 4H8" /></svg>,
    <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.8" strokeLinecap="round" strokeLinejoin="round"><path d="M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7z" /><path d="M14 2v4a2 2 0 0 0 2 2h4m-6 9-2-2-2 2m2-2v6" /></svg>,
    <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.8" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" /></svg>,
];

// ─── Three-dot context menu ───────────────────────────────────────────────────
function ContextMenu({ doc, onClose, onOpen, onRename, onDuplicate, onArchive, onDelete }) {
    const ref = useRef(null);
    const { toast } = useToast();

    useEffect(() => {
        const h = (e) => { if (!ref.current?.contains(e.target)) onClose(); };
        document.addEventListener("mousedown", h);
        return () => document.removeEventListener("mousedown", h);
    }, [onClose]);

    const copyLink = () => {
        const url = `${window.location.origin}/editor/${docPk(doc)}`;
        navigator.clipboard.writeText(url).then(() => toast.success("Link copied!"));
        onClose();
    };

    const menuItems = [
        {
            group: "actions",
            items: [
                { icon: "open_in_new", label: "Open", action: () => { onOpen(doc); onClose(); } },
                { icon: "edit", label: "Rename", action: () => { onRename(doc); onClose(); } },
                { icon: "content_copy", label: "Duplicate", action: () => { onDuplicate(doc); onClose(); } },
                { icon: "link", label: "Copy link", action: copyLink },
            ]
        },
        {
            group: "danger",
            items: [
                { icon: "archive", label: "Move to Archive", action: () => { onArchive(doc); onClose(); }, muted: true },
                { icon: "delete", label: "Delete", action: () => { onDelete(doc); onClose(); }, danger: true },
            ]
        }
    ];

    return (
        <div ref={ref} style={{
            position: "absolute", right: 0, top: 28, width: 200, zIndex: 100,
            background: T.surface, border: `1px solid ${T.border}`,
            borderRadius: 8, overflow: "hidden",
            boxShadow: "0 8px 24px rgba(0,0,0,.6)",
        }}>
            {menuItems.map((group, gi) => (
                <div key={gi}>
                    {gi > 0 && <div style={{ borderTop: `1px solid ${T.border}` }} />}
                    {group.items.map(({ icon, label, action, danger, muted }) => (
                        <button key={label} onClick={action}
                            style={{
                                width: "100%", display: "flex", alignItems: "center", gap: 10,
                                padding: "9px 14px", background: "none", border: "none",
                                color: danger ? "#ef4444" : muted ? T.mutedFg : T.fg,
                                fontSize: 13, cursor: "pointer", textAlign: "left", fontFamily: T.font,
                                transition: "background .12s",
                            }}
                            onMouseEnter={(e) => e.currentTarget.style.background = danger ? "rgba(239,68,68,.08)" : T.muted}
                            onMouseLeave={(e) => e.currentTarget.style.background = "none"}
                        >
                            <span className="material-symbols-outlined" style={{ fontSize: 15, color: danger ? "#ef4444" : T.mutedFg }}>
                                {icon}
                            </span>
                            {label}
                        </button>
                    ))}
                </div>
            ))}
        </div>
    );
}

// ─── Rename inline modal ──────────────────────────────────────────────────────
function RenameModal({ doc, onSave, onClose }) {
    const [title, setTitle] = useState(doc.title ?? "");
    const inputRef = useRef(null);
    useEffect(() => { inputRef.current?.focus(); inputRef.current?.select(); }, []);

    const submit = (e) => {
        e.preventDefault();
        if (title.trim()) onSave(doc, title.trim());
        onClose();
    };

    return (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,.6)", zIndex: 200, display: "flex", alignItems: "center", justifyContent: "center" }}
            onClick={onClose}>
            <div onClick={(e) => e.stopPropagation()}
                style={{ background: T.surface, border: `1px solid ${T.border}`, borderRadius: 10, padding: 24, width: 400, boxShadow: "0 20px 60px rgba(0,0,0,.6)" }}>
                <h3 style={{ fontSize: 16, fontWeight: 600, color: T.fg, marginBottom: 16, fontFamily: T.font }}>Rename document</h3>
                <form onSubmit={submit}>
                    <input ref={inputRef} value={title} onChange={(e) => setTitle(e.target.value)}
                        style={{ width: "100%", background: T.muted, border: `1px solid ${T.border}`, borderRadius: 6, padding: "10px 12px", color: T.fg, fontSize: 14, fontFamily: T.font, outline: "none", marginBottom: 16 }}
                        onFocus={(e) => e.target.style.borderColor = T.primary}
                        onBlur={(e) => e.target.style.borderColor = T.border}
                    />
                    <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
                        <button type="button" onClick={onClose}
                            style={{ padding: "8px 16px", background: "none", border: `1px solid ${T.border}`, color: T.mutedFg, borderRadius: 6, fontSize: 13, cursor: "pointer", fontFamily: T.font }}>
                            Cancel
                        </button>
                        <button type="submit"
                            style={{ padding: "8px 16px", background: T.primary, border: "none", color: T.primFg, borderRadius: 6, fontSize: 13, fontWeight: 500, cursor: "pointer", fontFamily: T.font }}>
                            Save
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
}

// ─── Delete confirm modal ─────────────────────────────────────────────────────
function DeleteModal({ doc, onConfirm, onClose }) {
    return (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,.6)", zIndex: 200, display: "flex", alignItems: "center", justifyContent: "center" }}
            onClick={onClose}>
            <div onClick={(e) => e.stopPropagation()}
                style={{ background: T.surface, border: `1px solid ${T.border}`, borderRadius: 10, padding: 24, width: 400, boxShadow: "0 20px 60px rgba(0,0,0,.6)" }}>
                <h3 style={{ fontSize: 16, fontWeight: 600, color: T.fg, marginBottom: 8, fontFamily: T.font }}>Delete document</h3>
                <p style={{ fontSize: 13, color: T.mutedFg, marginBottom: 24, lineHeight: 1.6 }}>
                    Are you sure you want to delete "<strong style={{ color: T.fg }}>{doc.title ?? "Untitled"}</strong>"? This cannot be undone.
                </p>
                <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
                    <button onClick={onClose}
                        style={{ padding: "8px 16px", background: "none", border: `1px solid ${T.border}`, color: T.mutedFg, borderRadius: 6, fontSize: 13, cursor: "pointer", fontFamily: T.font }}>
                        Cancel
                    </button>
                    <button onClick={() => { onConfirm(doc); onClose(); }}
                        style={{ padding: "8px 16px", background: "#ef4444", border: "none", color: "#fff", borderRadius: 6, fontSize: 13, fontWeight: 500, cursor: "pointer", fontFamily: T.font }}>
                        Delete
                    </button>
                </div>
            </div>
        </div>
    );
}

// ─── Document table row ───────────────────────────────────────────────────────
function DocRow({ doc, index, onOpen, onRename, onDuplicate, onArchive, onDelete }) {
    const [hov, setHov] = useState(false);
    const [menuOpen, setMenuOpen] = useState(false);
    const cat = inferCategory(doc.title ?? "");
    const tag = TAG_STYLE(cat);

    return (
        <div
            onMouseEnter={() => setHov(true)}
            onMouseLeave={() => { setHov(false); }}
            style={{
                display: "grid",
                gridTemplateColumns: "1fr 130px 160px 160px 44px",
                alignItems: "center", gap: 16,
                padding: "14px 20px",
                borderBottom: `1px solid ${T.border}`,
                background: hov ? "#1a1a1a" : "transparent",
                transition: "background .12s", cursor: "pointer",
            }}
            onClick={() => onOpen(doc)}
        >
            {/* Title + icon */}
            <div style={{ display: "flex", alignItems: "center", gap: 12, minWidth: 0 }}>
                <div style={{ width: 34, height: 34, background: T.muted, borderRadius: 6, display: "flex", alignItems: "center", justifyContent: "center", color: T.primary, flexShrink: 0 }}>
                    {ROW_ICONS[index % ROW_ICONS.length]}
                </div>
                <span style={{ fontSize: 14, fontWeight: 500, color: T.fg, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {doc.title ?? "Untitled Document"}
                </span>
            </div>

            {/* Tag */}
            <div>
                <span style={{ fontSize: 11, fontWeight: 500, padding: "3px 10px", borderRadius: 4, background: tag.bg, color: tag.text }}>
                    {cat}
                </span>
            </div>

            {/* Author */}
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <div style={{ width: 22, height: 22, borderRadius: "50%", background: `linear-gradient(135deg,${T.primary},#16a34a)`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 9, fontWeight: 700, color: T.primFg, flexShrink: 0 }}>
                    {userInitials(ownerName(doc.owner))}
                </div>
                <span style={{ fontSize: 13, color: T.mutedFg, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {ownerName(doc.owner)}
                </span>
            </div>

            {/* Date */}
            <span style={{ fontSize: 13, color: T.mutedFg, whiteSpace: "nowrap" }}>
                {fmtDate(doc.updatedAt ?? doc.createdAt)}
            </span>

            {/* Three-dot menu */}
            <div style={{ position: "relative" }} onClick={(e) => e.stopPropagation()}>
                <button
                    onClick={() => setMenuOpen((o) => !o)}
                    style={{
                        width: 28, height: 28, background: menuOpen ? T.muted : "none", border: "none",
                        borderRadius: 5, display: "flex", alignItems: "center", justifyContent: "center",
                        cursor: "pointer", color: hov || menuOpen ? T.mutedFg : "transparent",
                        transition: "all .15s",
                    }}
                >
                    <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.8" strokeLinecap="round" strokeLinejoin="round">
                        <circle cx="12" cy="5" r="1" /><circle cx="12" cy="12" r="1" /><circle cx="12" cy="19" r="1" />
                    </svg>
                </button>
                {menuOpen && (
                    <ContextMenu
                        doc={doc}
                        onClose={() => setMenuOpen(false)}
                        onOpen={onOpen}
                        onRename={onRename}
                        onDuplicate={onDuplicate}
                        onArchive={onArchive}
                        onDelete={onDelete}
                    />
                )}
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
                {[{ icon: <Icons.Settings size={14} />, label: "Account Settings", path: "/settings" }].map(({ icon, label, path }) => (
                    <button key={label} onClick={() => { navigate(path); onClose(); }}
                        style={{ width: "100%", display: "flex", alignItems: "center", gap: 12, padding: "10px 16px", background: "none", border: "none", color: T.mutedFg, fontSize: 13, cursor: "pointer", textAlign: "left", fontFamily: T.font, transition: "all .15s" }}
                        onMouseEnter={(e) => { e.currentTarget.style.background = T.muted; e.currentTarget.style.color = T.fg; }}
                        onMouseLeave={(e) => { e.currentTarget.style.background = "none"; e.currentTarget.style.color = T.mutedFg; }}>
                        <span style={{ color: T.mutedFg, display: "flex" }}>{icon}</span>{label}
                    </button>
                ))}
            </div>
            <div style={{ borderTop: `1px solid ${T.border}`, padding: "4px 0" }}>
                <button onClick={() => { onLogout(); onClose(); navigate("/auth"); }}
                    style={{ width: "100%", display: "flex", alignItems: "center", gap: 12, padding: "10px 16px", background: "none", border: "none", color: "#ef4444", fontSize: 13, cursor: "pointer", textAlign: "left", fontFamily: T.font, transition: "background .15s" }}
                    onMouseEnter={(e) => e.currentTarget.style.background = "rgba(239,68,68,.08)"}
                    onMouseLeave={(e) => e.currentTarget.style.background = "none"}>
                    <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.8" strokeLinecap="round" strokeLinejoin="round"><path d="m16 17 5-5-5-5m5 5H9m0 9H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" /></svg>
                    Sign out
                </button>
            </div>
        </div>
    );
}

// ─── ROOT: MyDocumentsPage ────────────────────────────────────────────────────
export default function MyDocumentsPage() {
    const navigate = useNavigate();
    const { toast } = useToast();
    const user = useAuthStore((s) => s.user);
    const logout = useAuthStore((s) => s.logout);
    const { loading, loadDocuments, createDoc, updateTitle, deleteDoc } = useDocument();

    const [documents, setDocuments] = useState([]);
    const [search, setSearch] = useState("");
    const [activeFilter, setActiveFilter] = useState("All");
    const [sortBy, setSortBy] = useState("Last edited");
    const [profileOpen, setProfileOpen] = useState(false);
    const [renameDoc, setRenameDoc] = useState(null);
    const [deleteDocObj, setDeleteDocObj] = useState(null);

    useEffect(() => {
        loadDocuments()
            .then((data) => { if (Array.isArray(data?.documents)) setDocuments(data.documents); })
            .catch(() => { });
    }, []);

    // Filter + sort
    const filtered = useMemo(() => {
        let docs = [...documents];
        if (search.trim()) docs = docs.filter((d) => (d.title ?? "").toLowerCase().includes(search.toLowerCase()));
        if (activeFilter !== "All") docs = docs.filter((d) => inferCategory(d.title ?? "") === activeFilter);
        if (sortBy === "Title") docs.sort((a, b) => (a.title ?? "").localeCompare(b.title ?? ""));
        if (sortBy === "Created") docs.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
        if (sortBy === "Last edited") docs.sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt));
        return docs;
    }, [documents, search, activeFilter, sortBy]);

    const handleOpen = useCallback((doc) => navigate(`/editor/${docPk(doc)}`), [navigate]);

    const handleNewDoc = useCallback(async () => {
        const doc = await createDoc("Untitled Document");
        if (doc) navigate(`/editor/${docPk(doc)}`);
        else toast.error("Failed to create document");
    }, [createDoc, navigate, toast]);

    const handleRename = useCallback(async (doc, newTitle) => {
        try {
            await updateTitle(docPk(doc), newTitle);
            setDocuments((prev) => prev.map((d) => docPk(d) === docPk(doc) ? { ...d, title: newTitle } : d));
            toast.success("Document renamed");
        } catch { toast.error("Failed to rename"); }
    }, [updateTitle, toast]);

    const handleDuplicate = useCallback(async (doc) => {
        try {
            const newDoc = await createDoc(`${doc.title ?? "Untitled"} (copy)`);
            if (newDoc) {
                setDocuments((prev) => [newDoc, ...prev]);
                toast.success("Document duplicated");
            }
        } catch { toast.error("Failed to duplicate"); }
    }, [createDoc, toast]);

    const handleArchive = useCallback(async (doc) => {
        try {
            await api.patch(`/documents/${docPk(doc)}`, { status: "Archived" });
            setDocuments((prev) => prev.filter((d) => docPk(d) !== docPk(doc)));
            toast.success("Document archived");
        } catch { toast.error("Failed to archive"); }
    }, [toast]);

    const handleDelete = useCallback(async (doc) => {
        try {
            await deleteDoc(docPk(doc));
            setDocuments((prev) => prev.filter((d) => docPk(d) !== docPk(doc)));
            toast.success("Document deleted");
        } catch { toast.error("Failed to delete"); }
    }, [deleteDoc, toast]);

    return (
        <div style={{ display: "flex", minHeight: "100vh", background: T.bg, fontFamily: T.font, color: T.fg }}>
            <Sidebar activeTab="docs" onNewDoc={handleNewDoc} />

            <main style={{ flex: 1, padding: "40px 48px", overflowY: "auto" }}>

                {/* Top bar */}
                <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: 36 }}>
                    <div>
                        <p style={{ fontSize: 11, fontWeight: 500, color: T.primary, textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: 6 }}>MY DOCUMENTS</p>
                        <h1 style={{ fontSize: 30, fontWeight: 600, color: T.fg, letterSpacing: "-.025em", fontFamily: T.font }}>All Documents</h1>
                    </div>

                    {/* Right controls */}
                    <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                        {/* Search */}
                        <div style={{ display: "flex", alignItems: "center", gap: 8, background: T.surface, border: `1px solid ${T.border}`, borderRadius: 6, padding: "8px 12px", width: 220 }}>
                            <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={T.mutedFg} strokeWidth="2.8" strokeLinecap="round" strokeLinejoin="round"><path d="m21 21-4.34-4.34" /><circle cx="11" cy="11" r="8" /></svg>
                            <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search documents..."
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
                    </div>
                </div>

                {/* Category filter pills */}
                <div style={{ display: "flex", gap: 8, marginBottom: 24, flexWrap: "wrap" }}>
                    {CATEGORIES.map((cat) => {
                        const active = activeFilter === cat;
                        return (
                            <button key={cat} onClick={() => setActiveFilter(cat)}
                                style={{
                                    padding: "6px 16px", borderRadius: 6, fontSize: 13, fontWeight: 500,
                                    background: active ? T.primary : T.surface,
                                    color: active ? T.primFg : T.mutedFg,
                                    border: `1px solid ${active ? T.primary : T.border}`,
                                    cursor: "pointer", fontFamily: T.font, transition: "all .15s",
                                }}
                                onMouseEnter={(e) => { if (!active) { e.currentTarget.style.borderColor = "#444"; e.currentTarget.style.color = T.fg; } }}
                                onMouseLeave={(e) => { if (!active) { e.currentTarget.style.borderColor = T.border; e.currentTarget.style.color = T.mutedFg; } }}
                            >
                                {cat}
                            </button>
                        );
                    })}

                    {/* Sort dropdown */}
                    <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 8 }}>
                        <span style={{ fontSize: 12, color: T.mutedFg }}>Sort:</span>
                        <select value={sortBy} onChange={(e) => setSortBy(e.target.value)}
                            style={{ background: T.surface, border: `1px solid ${T.border}`, color: T.fg, fontSize: 13, borderRadius: 6, padding: "6px 10px", outline: "none", cursor: "pointer", fontFamily: T.font }}>
                            {["Last edited", "Created", "Title"].map((s) => <option key={s} value={s}>{s}</option>)}
                        </select>
                    </div>
                </div>

                {/* Table */}
                <div style={{ background: T.surface, borderRadius: 10, border: `1px solid ${T.border}`, overflow: "hidden" }}>
                    {/* Header */}
                    <div style={{
                        display: "grid", gridTemplateColumns: "1fr 130px 160px 160px 44px",
                        gap: 16, padding: "12px 20px",
                        borderBottom: `1px solid ${T.border}`,
                    }}>
                        {["TITLE", "TAG", "AUTHOR", "LAST EDITED", ""].map((h, i) => (
                            <span key={i} style={{ fontSize: 11, fontWeight: 500, color: T.mutedFg, textTransform: "uppercase", letterSpacing: "0.08em" }}>{h}</span>
                        ))}
                    </div>

                    {/* Rows */}
                    {loading ? (
                        <div style={{ display: "flex", justifyContent: "center", padding: "60px 0" }}>
                            <svg style={{ animation: "spin .8s linear infinite", width: 24, height: 24, color: T.primary }} viewBox="0 0 24 24" fill="none">
                                <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" style={{ opacity: .25 }} />
                                <path fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" style={{ opacity: .75 }} />
                            </svg>
                        </div>
                    ) : filtered.length === 0 ? (
                        <div style={{ padding: "60px 20px", textAlign: "center" }}>
                            <p style={{ color: T.mutedFg, fontSize: 14, marginBottom: 16 }}>
                                {search || activeFilter !== "All" ? "No documents match your filters." : "No documents yet."}
                            </p>
                            {!search && activeFilter === "All" && (
                                <button onClick={handleNewDoc}
                                    style={{ background: T.primary, color: T.primFg, border: "none", borderRadius: 6, padding: "8px 20px", fontSize: 13, fontWeight: 500, cursor: "pointer", fontFamily: T.font }}>
                                    Create your first document
                                </button>
                            )}
                        </div>
                    ) : (
                        filtered.map((doc, i) => (
                            <DocRow key={docPk(doc)} doc={doc} index={i}
                                onOpen={handleOpen}
                                onRename={(d) => setRenameDoc(d)}
                                onDuplicate={handleDuplicate}
                                onArchive={handleArchive}
                                onDelete={(d) => setDeleteDocObj(d)}
                            />
                        ))
                    )}
                </div>

                {/* Row count */}
                {filtered.length > 0 && (
                    <p style={{ fontSize: 12, color: T.mutedFg, marginTop: 12, textAlign: "right" }}>
                        {filtered.length} document{filtered.length !== 1 ? "s" : ""}
                        {activeFilter !== "All" ? ` in ${activeFilter}` : ""}
                    </p>
                )}
            </main>

            {/* Modals */}
            {renameDoc && <RenameModal doc={renameDoc} onSave={handleRename} onClose={() => setRenameDoc(null)} />}
            {deleteDocObj && <DeleteModal doc={deleteDocObj} onConfirm={handleDelete} onClose={() => setDeleteDocObj(null)} />}

            <style>{`
        @keyframes spin { to { transform: rotate(360deg); } }
        input::placeholder { color: ${T.mutedFg}; }
        select option { background: ${T.surface}; }
      `}</style>
        </div>
    );
}