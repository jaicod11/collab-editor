/**
 * pages/SharedWithMePage.jsx
 * ─────────────────────────────────────────────────────────────────────────────
 * "Shared with Me" page converted from Stitch HTML output.
 *
 * Columns: TITLE | SHARED BY | SHARED AT | ACCESS | ⋯
 *
 * ── Dropdown menu fix ────────────────────────────────────────────────────────
 * The table wrapper below uses `overflow: hidden` (for its rounded corners).
 * A normal absolutely-positioned dropdown INSIDE that wrapper gets clipped by
 * it regardless of viewport space — flipping the menu up/down doesn't help
 * because the clip boundary is the table box itself, not the screen edge.
 * Fix: the three-dot menu is rendered via <PortalMenu> straight into
 * document.body with `position: fixed`, calculated from the button's real
 * on-screen coordinates — so it's never inside any overflow:hidden ancestor.
 */

import { useState, useEffect, useCallback, useRef, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { useToast } from "../components/UI/Toast";
import { useAuthStore } from "../store/authSlice";
import Sidebar, { T, Icons } from "../components/Layout/Sidebar";
import OpenSharedLink from "../components/UI/OpenSharedLink";
import PortalMenu from "../components/UI/PortalMenu";
import api from "../services/api";

const ICON_TINT = { bg: "rgba(122,122,122,.12)", icon: "#7a7a7a" };



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


// ─── Row icons (rotate per index, colored per category) ───────────────────────
const ROW_ICONS = [
    (color) => <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round"><path d="M14.106 5.553a2 2 0 0 0 1.788 0l3.659-1.83A1 1 0 0 1 21 4.619v12.764a1 1 0 0 1-.553.894l-4.553 2.277a2 2 0 0 1-1.788 0l-4.212-2.106a2 2 0 0 0-1.788 0l-3.659 1.83A1 1 0 0 1 3 19.381V6.618a1 1 0 0 1 .553-.894l4.553-2.277a2 2 0 0 1 1.788 0zm.894.211v15M9 3.236v15" /></svg>,
    (color) => <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round"><path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z" /><path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z" /></svg>,
    (color) => <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round"><path d="m18 16 4-4-4-4M6 8l-4 4 4 4m8.5-12-5 16" /></svg>,
    (color) => <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round"><path d="M6 22a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h8a2.4 2.4 0 0 1 1.704.706l3.588 3.588A2.4 2.4 0 0 1 20 8v12a2 2 0 0 1-2 2z" /><path d="M14 2v5a1 1 0 0 0 1 1h5M10 9H8m8 4H8m8 4H8" /></svg>,
    (color) => <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round"><rect width="18" height="18" x="3" y="3" rx="2" /><path d="M3 9h18M3 15h18M9 3v18" /></svg>,
    (color) => <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" /></svg>,
];

// ─── Menu item row (shared visual style) ──────────────────────────────────────
function MenuItemRow({ icon, label, onClick, danger }) {
    return (
        <button onClick={onClick}
            style={{
                width: "100%", display: "flex", alignItems: "center", gap: 10,
                padding: "9px 14px", background: T.surface, border: "none",
                color: danger ? "#ef4444" : T.fg,
                fontSize: 13, cursor: "pointer", textAlign: "left", fontFamily: T.font,
                transition: "background .12s",
            }}
            onMouseEnter={(e) => e.currentTarget.style.background = danger ? "rgba(239,68,68,.08)" : T.muted}
            onMouseLeave={(e) => e.currentTarget.style.background = T.surface}
        >
            <span className="material-symbols-outlined" style={{ fontSize: 15, color: danger ? "#ef4444" : T.mutedFg }}>
                {icon}
            </span>
            {label}
        </button>
    );
}

// ─── Three-dot context menu (limited actions for shared docs) — via portal ──
function SharedContextMenu({ doc, anchorRef, onClose, onOpen, onRemove }) {
    const { toast } = useToast();

    const copyLink = () => {
        navigator.clipboard.writeText(`${window.location.origin}/editor/${docPk(doc)}`)
            .then(() => toast.success("Link copied!"));
        onClose();
    };

    return (
        <PortalMenu anchorRef={anchorRef} onClose={onClose} width={180} estimatedHeight={180}>
            <div style={{
                background: T.surface, border: `1px solid ${T.border}`,
                borderRadius: 8, overflow: "hidden",
                boxShadow: "0 8px 24px rgba(0,0,0,.6)",
            }}>
                <MenuItemRow icon="open_in_new" label="Open" onClick={() => { onOpen(doc); onClose(); }} />
                <MenuItemRow icon="link" label="Copy link" onClick={copyLink} />
                <div style={{ borderTop: `1px solid ${T.border}` }} />
                <MenuItemRow icon="person_off" label="Remove me" danger onClick={() => { onRemove(doc); onClose(); }} />
            </div>
        </PortalMenu>
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
                    style={{ width: "100%", display: "flex", alignItems: "center", gap: 12, padding: "10px 16px", background: "none", border: "none", color: T.mutedFg, fontSize: 13, cursor: "pointer", textAlign: "left", fontFamily: T.font, transition: "all .15s" }}
                    onMouseEnter={(e) => { e.currentTarget.style.background = T.muted; e.currentTarget.style.color = T.fg; }}
                    onMouseLeave={(e) => { e.currentTarget.style.background = "none"; e.currentTarget.style.color = T.mutedFg; }}>
                    <Icons.Settings size={14} /> Account Settings
                </button>
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

// ─── Access badge ─────────────────────────────────────────────────────────────
// Reads the role the server actually stores. This used to be computed as
// `docPk(doc).charCodeAt(0) % 2 === 0` — the parity of the first character of
// the document's ObjectId — so roughly half of all shared documents were
// labelled read-only at random, and fabricated permissively: there was no
// permission model at all, and every collaborator could edit.
function AccessBadge({ canEdit }) {
    return canEdit ? (
        <span style={{ fontSize: 11, fontWeight: 600, padding: "3px 10px", borderRadius: 4, background: "rgba(61,220,110,.13)", color: "#3ddc6e" }}>
            Can edit
        </span>
    ) : (
        <span style={{ fontSize: 11, fontWeight: 500, padding: "3px 10px", borderRadius: 4, background: T.muted, color: T.mutedFg }}>
            Can view
        </span>
    );
}

// ─── Table row ────────────────────────────────────────────────────────────────
function SharedRow({ doc, index, onOpen, onRemove }) {
    const [hov, setHov] = useState(false);
    const [menuOpen, setMenuOpen] = useState(false);
    const btnRef = useRef(null);
    const iconColor = ICON_TINT.icon;
    const iconBg = ICON_TINT.bg;

    // The viewer's own role on this document, as stored by the server.
    // `myRole` is attached by SharedWithMePage from the collaborator entry.
    const canEdit = doc.myRole !== "viewer";

    return (
        <div
            onMouseEnter={() => setHov(true)}
            onMouseLeave={() => setHov(false)}
            style={{
                display: "grid",
                gridTemplateColumns: "1fr 170px 180px 120px 40px",
                alignItems: "center", gap: 16, padding: "14px 24px",
                borderBottom: `1px solid ${T.border}`,
                background: hov ? "#1f1f1f" : "transparent",
                transition: "background .12s", cursor: "pointer",
            }}
            onClick={() => onOpen(doc)}
        >
            {/* Title + icon */}
            <div style={{ display: "flex", alignItems: "center", gap: 12, minWidth: 0 }}>
                <div style={{ width: 34, height: 34, background: iconBg, borderRadius: 7, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                    {ROW_ICONS[index % ROW_ICONS.length](iconColor)}
                </div>
                <span style={{ fontSize: 14, fontWeight: 500, color: T.fg, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {doc.title ?? "Untitled Document"}
                </span>
            </div>

            {/* Shared by */}
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <div style={{ width: 22, height: 22, borderRadius: "50%", background: `linear-gradient(135deg,#3ddc6e,#16a34a)`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 9, fontWeight: 700, color: "#0f1a13", flexShrink: 0 }}>
                    {userInitials(ownerName(doc.owner))}
                </div>
                <span style={{ fontSize: 13, color: T.mutedFg, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {ownerName(doc.owner)}
                </span>
            </div>

            {/* Shared at */}
            <span style={{ fontSize: 13, color: T.mutedFg, whiteSpace: "nowrap" }}>
                {fmtDate(doc.updatedAt ?? doc.createdAt)}
            </span>

            {/* Access badge */}
            <div>
                <AccessBadge canEdit={canEdit} />
            </div>

            {/* Three-dot menu trigger */}
            <div onClick={(e) => e.stopPropagation()}>
                <button
                    ref={btnRef}
                    onClick={() => setMenuOpen(o => !o)}
                    style={{ width: 28, height: 28, background: menuOpen ? T.muted : "none", border: "none", borderRadius: 5, display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", color: hov || menuOpen ? T.mutedFg : "transparent", transition: "all .15s" }}
                >
                    <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.8" strokeLinecap="round" strokeLinejoin="round">
                        <circle cx="12" cy="5" r="1" /><circle cx="12" cy="12" r="1" /><circle cx="12" cy="19" r="1" />
                    </svg>
                </button>
                {menuOpen && (
                    <SharedContextMenu
                        doc={doc}
                        anchorRef={btnRef}
                        onClose={() => setMenuOpen(false)}
                        onOpen={onOpen}
                        onRemove={onRemove}
                    />
                )}
            </div>
        </div>
    );
}

// ─── ROOT: SharedWithMePage ───────────────────────────────────────────────────
export default function SharedWithMePage() {
    const navigate = useNavigate();
    const { toast } = useToast();
    const user = useAuthStore((s) => s.user);
    const logout = useAuthStore((s) => s.logout);

    const [documents, setDocuments] = useState([]);
    const [loading, setLoading] = useState(false);
    const [search, setSearch] = useState("");
    const [sortBy, setSortBy] = useState("Last edited");
    const [profileOpen, setProfileOpen] = useState(false);

    // Load shared docs from API
    // The toast helper is rebuilt on every ToastProvider render, so it is held
    // in a ref rather than declared as an effect dependency — otherwise showing
    // any toast anywhere would re-run this fetch.
    const toastRef = useRef(toast);
    toastRef.current = toast;

    useEffect(() => {
        setLoading(true);
        api.get("/documents", { params: { filter: "shared" } })
            .then(({ data }) => {
                if (!Array.isArray(data?.documents)) return;
                // Each document carries its full collaborator list with roles;
                // pick out this user's entry so the row shows the real one.
                setDocuments(
                    data.documents.map((d) => ({
                        ...d,
                        myRole:
                            (d.collaborators ?? []).find((c) => String(c._id) === String(user?.id))
                                ?.role ?? "editor",
                    }))
                );
            })
            .catch(() => toastRef.current.error("Could not load shared documents"))
            .finally(() => setLoading(false));
        // user?.id is read to pick this person's role out of each collaborator
        // list, so it is a real dependency, and a stable string.
    }, [user?.id]);

    const filtered = useMemo(() => {
        let docs = [...documents];
        if (search.trim()) docs = docs.filter((d) => (d.title ?? "").toLowerCase().includes(search.toLowerCase()));
        if (sortBy === "Title") docs.sort((a, b) => (a.title ?? "").localeCompare(b.title ?? ""));
        if (sortBy === "Created") docs.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
        else docs.sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt));
        return docs;
    }, [documents, search, sortBy]);

    const handleOpen = useCallback((doc) => navigate(`/editor/${docPk(doc)}`), [navigate]);

    // Removes the current user from the document's collaborator list.
    //
    // This used to catch EVERY failure — network error, 401, 500 — drop the row
    // from the table and fire a green success toast, so the user believed they
    // had left a document they were still in. The row is only removed once the
    // server confirms it. (The old comment claimed the endpoint did not exist;
    // it does, at documentRoutes.js.)
    const handleRemove = useCallback(async (doc) => {
        try {
            await api.patch(`/documents/${docPk(doc)}/leave`);
            setDocuments((prev) => prev.filter((d) => docPk(d) !== docPk(doc)));
            toast.success("Removed from shared document");
        } catch (err) {
            toast.error(
                err.response?.data?.message ?? "Could not remove you from this document"
            );
        }
    }, [toast]);

    return (
        <div style={{ display: "flex", minHeight: "100vh", background: T.bg, fontFamily: T.font, color: T.fg }}>
            <Sidebar activeTab="shared" />

            <main style={{ flex: 1, padding: "40px 48px", overflowY: "auto" }}>

                {/* ── Top bar ──────────────────────────────────────────────────── */}
                <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: 36 }}>
                    <div>
                        <p style={{ fontSize: 11, fontWeight: 500, color: T.primary, textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: 6 }}>
                            SHARED WITH ME
                        </p>
                        <h1 style={{ fontSize: 30, fontWeight: 600, color: T.fg, letterSpacing: "-.025em", fontFamily: T.font, marginBottom: 6 }}>
                            Shared Documents
                        </h1>
                        <p style={{ fontSize: 13, color: T.mutedFg }}>
                            Documents that collaborators have shared with you.
                        </p>
                    </div>

                    {/* Controls */}
                    <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                        {/* Search */}
                        <div style={{ display: "flex", alignItems: "center", gap: 8, background: T.surface, border: `1px solid ${T.border}`, borderRadius: 6, padding: "8px 12px", width: 220 }}>
                            <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={T.mutedFg} strokeWidth="2.8" strokeLinecap="round" strokeLinejoin="round"><path d="m21 21-4.34-4.34" /><circle cx="11" cy="11" r="8" /></svg>
                            <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search by title…"
                                style={{ background: "none", border: "none", outline: "none", color: T.fg, fontSize: 13, fontFamily: T.font, width: "100%" }} />
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

                <OpenSharedLink theme={T} />

                {/* Sort control */}
                <div style={{ display: "flex", gap: 8, marginBottom: 28, flexWrap: "wrap", alignItems: "center" }}>
                    <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 8 }}>
                        <span style={{ fontSize: 12, color: T.mutedFg }}>Sort:</span>
                        <select value={sortBy} onChange={(e) => setSortBy(e.target.value)}
                            style={{ background: T.surface, border: `1px solid ${T.border}`, color: T.fg, fontSize: 13, borderRadius: 6, padding: "6px 10px", outline: "none", cursor: "pointer", fontFamily: T.font }}>
                            {["Last edited", "Created", "Title"].map((s) => <option key={s} value={s}>{s}</option>)}
                        </select>
                    </div>
                </div>

                {/* ── Table ────────────────────────────────────────────────────── */}
                <div style={{ background: T.surface, borderRadius: 10, border: `1px solid ${T.border}`, overflow: "hidden" }}>

                    {/* Header */}
                    <div style={{ display: "grid", gridTemplateColumns: "1fr 170px 180px 120px 40px", gap: 16, padding: "12px 24px", borderBottom: `1px solid ${T.border}` }}>
                        {["TITLE", "SHARED BY", "SHARED AT", "ACCESS", ""].map((h, i) => (
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
                        <div style={{ padding: "80px 24px", textAlign: "center" }}>
                            <div style={{ width: 48, height: 48, borderRadius: "50%", background: T.muted, display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 16px", color: T.mutedFg }}>
                                <svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /><path d="M22 21v-2a4 4 0 0 0-3-3.87" /><path d="M16 3.13a4 4 0 0 1 0 7.75" /></svg>
                            </div>
                            <p style={{ color: T.fg, fontSize: 15, fontWeight: 500, marginBottom: 6 }}>
                                {search ? "No matching documents" : "No shared documents yet"}
                            </p>
                            <p style={{ color: T.mutedFg, fontSize: 13, lineHeight: 1.6 }}>
                                {search
                                    ? "Try adjusting your search."
                                    : "When someone shares a document with you, it will appear here."}
                            </p>
                        </div>
                    ) : (
                        filtered.map((doc, i) => (
                            <SharedRow key={docPk(doc)} doc={doc} index={i}
                                onOpen={handleOpen}
                                onRemove={handleRemove}
                            />
                        ))
                    )}
                </div>

                {filtered.length > 0 && (
                    <p style={{ fontSize: 12, color: T.mutedFg, marginTop: 12, textAlign: "right" }}>
                        {filtered.length} shared document{filtered.length !== 1 ? "s" : ""}
                    </p>
                )}
            </main>

            <style>{`
        @keyframes spin { to { transform:rotate(360deg); } }
        input::placeholder { color:${T.mutedFg}; }
        select option { background:${T.surface}; }
      `}</style>
        </div>
    );
}