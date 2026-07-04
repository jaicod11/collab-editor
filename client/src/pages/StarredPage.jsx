import { useState, useEffect, useCallback, useRef, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { useToast } from "../components/UI/Toast";
import { useAuthStore } from "../store/authSlice";
import Sidebar, { T, Icons } from "../components/Layout/Sidebar";
import api from "../services/api";

// ─── Category colors (unified with all other pages) ───────────────────────────
const CAT = {
    General: { bg: "rgba(122,122,122,.12)", text: "#7a7a7a", icon: "#7a7a7a" },
    Product: { bg: "rgba(61,220,110,.13)", text: "#3ddc6e", icon: "#3ddc6e" },
    Design: { bg: "rgba(224,92,42,.13)", text: "#e05c2a", icon: "#e05c2a" },
    Engineering: { bg: "rgba(42,122,224,.13)", text: "#2a7ae0", icon: "#2a7ae0" },
    Research: { bg: "rgba(200,168,0,.13)", text: "#c8a800", icon: "#c8a800" },
    Finance: { bg: "rgba(139,42,224,.13)", text: "#8b2ae0", icon: "#8b2ae0" },
    Marketing: { bg: "rgba(224,42,106,.13)", text: "#e02a6a", icon: "#e02a6a" },
};

// ─── Helpers ──────────────────────────────────────────────────────────────────
function docPk(d) { return d?._id ?? d?.id ?? ""; }
function ownerName(o) { if (!o) return "Unknown"; return typeof o === "object" ? (o.name ?? o.email ?? "Unknown") : String(o); }
function initials(n) { if (!n) return "?"; return n.split(" ").map(x => x[0]).join("").toUpperCase().slice(0, 2); }

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
    if (s.includes("design") || s.includes("brand") || s.includes("onboard") || s.includes("ui")) return "Design";
    if (s.includes("engineer") || s.includes("api") || s.includes("code") || s.includes("sprint")) return "Engineering";
    if (s.includes("research") || s.includes("survey") || s.includes("interview")) return "Research";
    if (s.includes("market") || s.includes("copy") || s.includes("campaign")) return "Marketing";
    if (s.includes("finance") || s.includes("investor") || s.includes("deck") || s.includes("budget")) return "Finance";
    if (s.includes("product") || s.includes("roadmap") || s.includes("okr")) return "Product";
    return "General";
}

// ─── localStorage starred state ───────────────────────────────────────────────
const STARRED_KEY = "collab-starred";

function getStarred() {
    try { return new Set(JSON.parse(localStorage.getItem(STARRED_KEY) ?? "[]")); }
    catch { return new Set(); }
}
function setStarredStorage(ids) {
    localStorage.setItem(STARRED_KEY, JSON.stringify([...ids]));
}
function toggleStarred(id) {
    const set = getStarred();
    if (set.has(id)) set.delete(id); else set.add(id);
    setStarredStorage(set);
    return set;
}

// ─── Card icons (rotate per index, colored per category) ─────────────────────
const CARD_ICONS = [
    (c) => <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><path d="M14.106 5.553a2 2 0 0 0 1.788 0l3.659-1.83A1 1 0 0 1 21 4.619v12.764a1 1 0 0 1-.553.894l-4.553 2.277a2 2 0 0 1-1.788 0l-4.212-2.106a2 2 0 0 0-1.788 0l-3.659 1.83A1 1 0 0 1 3 19.381V6.618a1 1 0 0 1 .553-.894l4.553-2.277a2 2 0 0 1 1.788 0zm.894.211v15M9 3.236v15" /></svg>,
    (c) => <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z" /><path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z" /></svg>,
    (c) => <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><rect width="8" height="4" x="8" y="2" rx="1" /><path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2" /><path d="M12 11h4m-4 4h4m-8-4h.01M8 15h.01" /></svg>,
    (c) => <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><path d="M2 3h20m-1 0v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V3" /><path d="m7 21 5-5 5 5" /></svg>,
    (c) => <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><path d="m18 16 4-4-4-4M6 8l-4 4 4 4m8.5-12-5 16" /></svg>,
    (c) => <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /><path d="M22 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75" /></svg>,
];

// ─── Gold Star icon ───────────────────────────────────────────────────────────
const StarIcon = ({ filled, size = 15 }) => (
    <svg xmlns="http://www.w3.org/2000/svg" width={size} height={size} viewBox="0 0 24 24"
        fill={filled ? "#f59e0b" : "none"} stroke="#f59e0b"
        strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M11.525 2.295a.53.53 0 0 1 .95 0l2.31 4.679a2.12 2.12 0 0 0 1.595 1.16l5.166.756a.53.53 0 0 1 .294.904l-3.736 3.638a2.12 2.12 0 0 0-.611 1.878l.882 5.14a.53.53 0 0 1-.771.56l-4.618-2.428a2.12 2.12 0 0 0-1.973 0L6.396 21.01a.53.53 0 0 1-.77-.56l.881-5.139a2.12 2.12 0 0 0-.611-1.879L2.16 9.795a.53.53 0 0 1 .294-.906l5.165-.755a2.12 2.12 0 0 0 1.597-1.16z" />
    </svg>
);

// ─── Document card ────────────────────────────────────────────────────────────
function StarredCard({ doc, index, onOpen, onUnstar }) {
    const [hov, setHov] = useState(false);
    const [starHov, setStarHov] = useState(false);

    const cat = inferCategory(doc.title ?? "");
    const catColor = CAT[cat] ?? CAT.General;

    return (
        <div
            onMouseEnter={() => setHov(true)}
            onMouseLeave={() => setHov(false)}
            style={{
                background: hov ? "#1e1e1e" : T.surface,
                border: `1px solid ${hov ? "#333" : T.border}`,
                borderRadius: 12, overflow: "hidden",
                transition: "all .18s", cursor: "pointer",
                display: "flex", flexDirection: "column",
            }}
            onClick={() => onOpen(doc)}
        >
            {/* Card body */}
            <div style={{ padding: "20px 20px 16px", flex: 1 }}>
                {/* Icon + Star row */}
                <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: 16 }}>
                    {/* Category icon */}
                    <div style={{
                        width: 40, height: 40, borderRadius: 8, flexShrink: 0,
                        background: catColor.bg,
                        display: "flex", alignItems: "center", justifyContent: "center",
                    }}>
                        {CARD_ICONS[index % CARD_ICONS.length](catColor.icon)}
                    </div>

                    {/* Star button */}
                    <button
                        title="Remove from starred"
                        onClick={(e) => { e.stopPropagation(); onUnstar(doc); }}
                        onMouseEnter={() => setStarHov(true)}
                        onMouseLeave={() => setStarHov(false)}
                        style={{
                            width: 28, height: 28, background: starHov ? "rgba(245,158,11,.1)" : "none",
                            border: "none", borderRadius: 6, display: "flex",
                            alignItems: "center", justifyContent: "center",
                            cursor: "pointer", transition: "background .15s", flexShrink: 0,
                        }}
                    >
                        <StarIcon filled={!starHov} size={16} />
                    </button>
                </div>

                {/* Title */}
                <h3 style={{
                    fontSize: 15, fontWeight: 600, color: T.fg,
                    marginBottom: 10, lineHeight: 1.35, fontFamily: T.font,
                    overflow: "hidden", textOverflow: "ellipsis",
                    display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical",
                }}>
                    {doc.title ?? "Untitled Document"}
                </h3>

                {/* Category tag */}
                <span style={{
                    fontSize: 11, fontWeight: 600, padding: "3px 10px", borderRadius: 4,
                    background: catColor.bg, color: catColor.text, display: "inline-block",
                }}>
                    {cat}
                </span>
            </div>

            {/* Card footer */}
            <div style={{
                display: "flex", alignItems: "center", justifyContent: "space-between",
                padding: "12px 20px", borderTop: `1px solid ${T.border}`,
            }}>
                {/* Owner */}
                <div style={{ display: "flex", alignItems: "center", gap: 8, minWidth: 0 }}>
                    <div style={{
                        width: 22, height: 22, borderRadius: "50%", flexShrink: 0,
                        background: `linear-gradient(135deg,${T.primary},#16a34a)`,
                        display: "flex", alignItems: "center", justifyContent: "center",
                        fontSize: 9, fontWeight: 700, color: T.primFg,
                    }}>
                        {initials(ownerName(doc.owner))}
                    </div>
                    <span style={{ fontSize: 12, color: T.mutedFg, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                        {ownerName(doc.owner)}
                    </span>
                </div>

                {/* Date */}
                <span style={{ fontSize: 12, color: T.mutedFg, whiteSpace: "nowrap", flexShrink: 0, marginLeft: 8 }}>
                    {fmtDate(doc.updatedAt ?? doc.createdAt)}
                </span>
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
                    {initials(user?.name)}
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

// ─── ROOT: StarredPage ────────────────────────────────────────────────────────
export default function StarredPage() {
    const navigate = useNavigate();
    const { toast } = useToast();
    const user = useAuthStore((s) => s.user);
    const logout = useAuthStore((s) => s.logout);

    const [allDocs, setAllDocs] = useState([]);
    const [starredIds, setStarredIds] = useState(getStarred);
    const [loading, setLoading] = useState(false);
    const [search, setSearch] = useState("");
    const [profileOpen, setProfileOpen] = useState(false);

    // Load all docs, filter to starred on client
    useEffect(() => {
        setLoading(true);
        api.get("/documents", { params: { filter: "all" } })
            .then(({ data }) => {
                if (Array.isArray(data?.documents)) setAllDocs(data.documents);
            })
            .catch(() => { })
            .finally(() => setLoading(false));

        // Pre-star all docs on first visit if nothing starred yet (demo UX)
        // Remove this block once backend starred field exists
        const existing = getStarred();
        if (existing.size === 0) {
            // Page will show empty state — user can star from other pages
        }
    }, []);

    // Starred documents = those whose IDs are in starredIds
    const starredDocs = useMemo(() => {
        const docs = allDocs.filter((d) => starredIds.has(docPk(d)));
        if (!search.trim()) return docs;
        const q = search.toLowerCase();
        return docs.filter((d) => (d.title ?? "").toLowerCase().includes(q));
    }, [allDocs, starredIds, search]);

    const handleOpen = useCallback((doc) => navigate(`/editor/${docPk(doc)}`), [navigate]);

    const handleUnstar = useCallback((doc) => {
        const newSet = toggleStarred(docPk(doc));
        setStarredIds(new Set(newSet));
        toast.success(`"${doc.title ?? "Document"}" removed from starred`);
    }, [toast]);

    const handleNewDoc = useCallback(() => navigate("/new"), [navigate]);

    return (
        <div style={{ display: "flex", minHeight: "100vh", background: T.bg, fontFamily: T.font, color: T.fg }}>
            <Sidebar activeTab="starred" onNewDoc={handleNewDoc} />

            <main style={{ flex: 1, padding: "40px 48px", overflowY: "auto" }}>

                {/* ── Header ────────────────────────────────────────────────────── */}
                <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: 36 }}>
                    <div>
                        <p style={{ fontSize: 11, fontWeight: 600, color: T.primary, textTransform: "uppercase", letterSpacing: "0.12em", marginBottom: 6 }}>
                            STARRED
                        </p>
                        <h1 style={{ fontSize: 30, fontWeight: 600, color: T.fg, letterSpacing: "-.025em", fontFamily: T.font, marginBottom: 4 }}>
                            Starred Documents
                        </h1>
                        <p style={{ fontSize: 13, color: T.mutedFg }}>
                            Documents you've marked as important for quick access.
                        </p>
                    </div>

                    {/* Right controls */}
                    <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                        {/* Search */}
                        <div style={{ display: "flex", alignItems: "center", gap: 8, background: T.surface, border: `1px solid ${T.border}`, borderRadius: 6, padding: "8px 12px", width: 220 }}>
                            <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={T.mutedFg} strokeWidth="2.8" strokeLinecap="round" strokeLinejoin="round"><path d="m21 21-4.34-4.34" /><circle cx="11" cy="11" r="8" /></svg>
                            <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search starred..."
                                style={{ background: "none", border: "none", outline: "none", color: T.fg, fontSize: 13, fontFamily: T.font, width: "100%" }} />
                        </div>

                        {/* Bell */}
                        <div style={{ width: 36, height: 36, background: T.surface, border: `1px solid ${T.border}`, borderRadius: 6, display: "flex", alignItems: "center", justifyContent: "center", color: T.mutedFg, position: "relative", cursor: "pointer" }}>
                            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round"><path d="M10.268 21a2 2 0 0 0 3.464 0m-10.47-5.674A1 1 0 0 0 4 17h16a1 1 0 0 0 .74-1.673C19.41 13.956 18 12.499 18 8A6 6 0 0 0 6 8c0 4.499-1.411 5.956-2.738 7.326" /></svg>
                            <div style={{ position: "absolute", top: 8, right: 8, width: 6, height: 6, background: T.primary, borderRadius: "50%" }} />
                        </div>

                        {/* Profile avatar */}
                        <div style={{ position: "relative" }}>
                            <button onClick={() => setProfileOpen(o => !o)}
                                style={{ width: 36, height: 36, borderRadius: "50%", background: `linear-gradient(135deg,${T.primary},#16a34a)`, border: `2px solid ${T.primary}`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 12, fontWeight: 700, color: T.primFg, cursor: "pointer" }}>
                                {initials(user?.name)}
                            </button>
                            <ProfileDropdown user={user} open={profileOpen} onClose={() => setProfileOpen(false)} onLogout={logout} navigate={navigate} />
                        </div>
                    </div>
                </div>

                {/* ── Card grid ─────────────────────────────────────────────────── */}
                {loading ? (
                    <div style={{ display: "flex", justifyContent: "center", padding: "80px 0" }}>
                        <svg style={{ animation: "spin .8s linear infinite", width: 24, height: 24, color: T.primary }} viewBox="0 0 24 24" fill="none">
                            <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" style={{ opacity: .25 }} />
                            <path fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" style={{ opacity: .75 }} />
                        </svg>
                    </div>
                ) : starredDocs.length === 0 ? (
                    /* Empty state */
                    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: "100px 24px", textAlign: "center" }}>
                        <div style={{ width: 56, height: 56, borderRadius: "50%", background: T.muted, display: "flex", alignItems: "center", justifyContent: "center", marginBottom: 20 }}>
                            <StarIcon filled={false} size={24} />
                        </div>
                        <h3 style={{ fontSize: 16, fontWeight: 600, color: T.fg, marginBottom: 8, fontFamily: T.font }}>
                            {search ? "No matching starred documents" : "No starred documents"}
                        </h3>
                        <p style={{ fontSize: 13, color: T.mutedFg, lineHeight: 1.6, maxWidth: 320 }}>
                            {search
                                ? "Try adjusting your search query."
                                : "Star documents from My Documents or the editor to find them quickly here."
                            }
                        </p>
                        {!search && (
                            <button onClick={() => navigate("/documents")}
                                style={{ marginTop: 20, padding: "8px 20px", background: T.primary, color: T.primFg, border: "none", borderRadius: 6, fontSize: 13, fontWeight: 500, cursor: "pointer", fontFamily: T.font }}>
                                Browse My Documents
                            </button>
                        )}
                    </div>
                ) : (
                    <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 20 }}>
                        {starredDocs.map((doc, i) => (
                            <StarredCard
                                key={docPk(doc)}
                                doc={doc}
                                index={i}
                                onOpen={handleOpen}
                                onUnstar={handleUnstar}
                            />
                        ))}
                    </div>
                )}
            </main>

            <style>{`
        @keyframes spin { to { transform:rotate(360deg); } }
        input::placeholder { color:${T.mutedFg}; }
      `}</style>
        </div>
    );
}