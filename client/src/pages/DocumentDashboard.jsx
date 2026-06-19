/**
 * pages/DocumentDashboard.jsx — Home page
 * Uses shared Sidebar component. Shows greeting, pinned docs, recent docs.
 */

import { useState, useEffect, useCallback, useRef, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { useDocument } from "../hooks/useDocument";
import { useToast } from "../components/UI/Toast";
import { useAuthStore } from "../store/authSlice";
import Sidebar, { T, Icons } from "../components/Layout/Sidebar";

// ─── Helpers ──────────────────────────────────────────────────────────────────
function getGreeting() {
  const h = new Date().getHours();
  if (h < 12) return "Good morning";
  if (h < 17) return "Good afternoon";
  return "Good evening";
}
function getFormattedDate() {
  return new Date().toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" });
}
function fmtDate(d) {
  if (!d) return "—";
  const dt = new Date(d), now = new Date(), diff = now - dt;
  const mins = Math.round(diff / 60000), hrs = Math.round(diff / 3600000);
  if (mins < 60) return `${mins}m ago`;
  if (hrs < 24) return `Today at ${dt.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })}`;
  if (hrs < 48) return `Yesterday`;
  return dt.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });
}
function docPk(doc) { return doc?._id ?? doc?.id ?? ""; }
function ownerName(o) { if (!o) return "Unknown"; return typeof o === "object" ? (o.name ?? o.email ?? "Unknown") : String(o); }
function userInitials(n) { if (!n) return "?"; return n.split(" ").map(x => x[0]).join("").toUpperCase().slice(0, 2); }
function inferCategory(t = "") {
  const s = t.toLowerCase();
  if (s.includes("design") || s.includes("brand") || s.includes("ui") || s.includes("onboard")) return "Design";
  if (s.includes("engineer") || s.includes("api") || s.includes("code") || s.includes("sprint")) return "Engineering";
  if (s.includes("research") || s.includes("survey") || s.includes("user")) return "Research";
  if (s.includes("market") || s.includes("copy") || s.includes("campaign")) return "Marketing";
  if (s.includes("finance") || s.includes("investor") || s.includes("budget")) return "Finance";
  return "Product";
}
const TAG_COLORS = {
  Product: "#1a2e22", Design: "#1a2e22",
  Engineering: "#1c1c1c", Research: "#1c1c1c", Finance: "#1c1c1c", Marketing: "#1c1c1c",
};
const TAG_TEXT = {
  Product: T.primary, Design: T.primary,
  Engineering: T.mutedFg, Research: T.mutedFg, Finance: T.mutedFg, Marketing: T.mutedFg,
};

const DOC_ICONS = ["map", "file-text", "target", "code", "clipboard-list", "file"];
const DocIconSvg = ({ name }) => {
  const map = {
    map: <svg xmlns="http://www.w3.org/2000/svg" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3.2" strokeLinecap="round" strokeLinejoin="round"><path d="M14.106 5.553a2 2 0 0 0 1.788 0l3.659-1.83A1 1 0 0 1 21 4.619v12.764a1 1 0 0 1-.553.894l-4.553 2.277a2 2 0 0 1-1.788 0l-4.212-2.106a2 2 0 0 0-1.788 0l-3.659 1.83A1 1 0 0 1 3 19.381V6.618a1 1 0 0 1 .553-.894l4.553-2.277a2 2 0 0 1 1.788 0zm.894.211v15M9 3.236v15" /></svg>,
    "file-text": <svg xmlns="http://www.w3.org/2000/svg" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3.2" strokeLinecap="round" strokeLinejoin="round"><path d="M6 22a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h8a2.4 2.4 0 0 1 1.704.706l3.588 3.588A2.4 2.4 0 0 1 20 8v12a2 2 0 0 1-2 2z" /><path d="M14 2v5a1 1 0 0 0 1 1h5M10 9H8m8 4H8m8 4H8" /></svg>,
    target: <svg xmlns="http://www.w3.org/2000/svg" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3.2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10" /><circle cx="12" cy="12" r="6" /><circle cx="12" cy="12" r="2" /></svg>,
    code: <svg xmlns="http://www.w3.org/2000/svg" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3.2" strokeLinecap="round" strokeLinejoin="round"><path d="m18 16 4-4-4-4M6 8l-4 4 4 4m8.5-12-5 16" /></svg>,
  };
  return map[name] ?? map["file-text"];
};

// ─── Profile Dropdown ─────────────────────────────────────────────────────────
function ProfileDropdown({ user, open, onClose, onLogout, navigate }) {
  const ref = useRef(null);
  useEffect(() => {
    if (!open) return;
    const h = (e) => { if (!ref.current?.contains(e.target)) onClose(); };
    document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, [open, onClose]);
  if (!open) return null;
  const items = [
    { icon: <Icons.Settings size={14} />, label: "Account Settings", action: () => { navigate("/settings"); onClose(); } },
  ];
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
        {items.map(({ icon, label, action }) => (
          <button key={label} onClick={action}
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

// ─── Top bar ──────────────────────────────────────────────────────────────────
function TopBar({ user, search, onSearch, onLogout, navigate }) {
  const [profileOpen, setProfileOpen] = useState(false);
  return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 40 }}>
      <div>
        <p style={{ fontSize: 11, color: T.primary, fontWeight: 500, textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: 4 }}>{getFormattedDate()}</p>
        <h1 style={{ fontSize: 30, fontWeight: 600, color: T.fg, letterSpacing: "-.025em", lineHeight: 1.25, fontFamily: T.font }}>{getGreeting()}, {user?.name?.split(" ")[0] ?? "there"}</h1>
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, background: T.surface, border: `1px solid ${T.border}`, borderRadius: 6, padding: "8px 12px", width: 220, color: T.mutedFg, fontSize: 13 }}>
          <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.8" strokeLinecap="round" strokeLinejoin="round"><path d="m21 21-4.34-4.34" /><circle cx="11" cy="11" r="8" /></svg>
          <input value={search} onChange={(e) => onSearch(e.target.value)} placeholder="Search documents..." style={{ background: "none", border: "none", outline: "none", color: T.fg, fontSize: 13, fontFamily: T.font, width: "100%" }} />
        </div>
        <div style={{ width: 36, height: 36, background: T.surface, border: `1px solid ${T.border}`, borderRadius: 6, display: "flex", alignItems: "center", justifyContent: "center", color: T.mutedFg, position: "relative", cursor: "pointer" }}>
          <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round"><path d="M10.268 21a2 2 0 0 0 3.464 0m-10.47-5.674A1 1 0 0 0 4 17h16a1 1 0 0 0 .74-1.673C19.41 13.956 18 12.499 18 8A6 6 0 0 0 6 8c0 4.499-1.411 5.956-2.738 7.326" /></svg>
          <div style={{ position: "absolute", top: 8, right: 8, width: 6, height: 6, background: T.primary, borderRadius: "50%" }} />
        </div>
        <div style={{ position: "relative" }}>
          <button onClick={() => setProfileOpen(o => !o)}
            style={{ width: 36, height: 36, borderRadius: "50%", background: `linear-gradient(135deg,${T.primary},#16a34a)`, border: `2px solid ${T.primary}`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 12, fontWeight: 700, color: T.primFg, cursor: "pointer" }}>
            {userInitials(user?.name)}
          </button>
          <ProfileDropdown user={user} open={profileOpen} onClose={() => setProfileOpen(false)} onLogout={onLogout} navigate={navigate} />
        </div>
      </div>
    </div>
  );
}

// ─── Document card ────────────────────────────────────────────────────────────
function DocCard({ doc, index, onClick }) {
  const [hov, setHov] = useState(false);
  const cat = inferCategory(doc.title);
  return (
    <button onClick={() => onClick(doc)}
      onMouseEnter={() => setHov(true)} onMouseLeave={() => setHov(false)}
      style={{ display: "flex", flexDirection: "column", gap: 16, background: hov ? "#1a1a1a" : T.surface, borderRadius: 8, border: `1px solid ${hov ? "#333" : T.border}`, padding: 20, cursor: "pointer", textAlign: "left", transition: "all .15s", width: "100%" }}>
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 12 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <div style={{ width: 36, height: 36, background: T.muted, borderRadius: 6, display: "flex", alignItems: "center", justifyContent: "center", color: T.primary, flexShrink: 0 }}>
            <DocIconSvg name={DOC_ICONS[index % DOC_ICONS.length]} />
          </div>
          <div>
            <p style={{ fontSize: 14, fontWeight: 500, color: T.fg, lineHeight: 1.3, marginBottom: 2 }}>{doc.title ?? "Untitled"}</p>
            <p style={{ fontSize: 11, color: T.mutedFg }}>{fmtDate(doc.updatedAt ?? doc.createdAt)}</p>
          </div>
        </div>
        <div style={{ fontSize: 11, fontWeight: 500, padding: "2px 8px", borderRadius: 4, background: TAG_COLORS[cat], color: TAG_TEXT[cat], flexShrink: 0 }}>{cat}</div>
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 8, paddingTop: 12, borderTop: `1px solid ${T.border}` }}>
        <div style={{ width: 20, height: 20, borderRadius: "50%", background: `linear-gradient(135deg,${T.primary},#16a34a)`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 8, fontWeight: 700, color: T.primFg, flexShrink: 0 }}>
          {userInitials(ownerName(doc.owner))}
        </div>
        <span style={{ fontSize: 11, color: T.mutedFg }}>{ownerName(doc.owner)}</span>
      </div>
    </button>
  );
}

// ─── ROOT ─────────────────────────────────────────────────────────────────────
export default function DocumentDashboard() {
  const navigate = useNavigate();
  const { toast } = useToast();
  const user = useAuthStore((s) => s.user);
  const logout = useAuthStore((s) => s.logout);
  const { loading, loadDocuments, createDoc } = useDocument();
  const [documents, setDocuments] = useState([]);
  const [search, setSearch] = useState("");

  useEffect(() => {
    loadDocuments().then((data) => { if (Array.isArray(data?.documents)) setDocuments(data.documents); }).catch(() => { });
  }, []);

  const filtered = useMemo(() => {
    if (!search.trim()) return documents;
    const q = search.toLowerCase();
    return documents.filter((d) => (d.title ?? "").toLowerCase().includes(q));
  }, [documents, search]);

  const pinned = filtered.slice(0, 3);
  const recent = filtered.slice(3, 9);

  const handleOpen = useCallback((doc) => navigate(`/editor/${docPk(doc)}`), [navigate]);
  const handleNewDoc = useCallback(async () => {
    const doc = await createDoc("Untitled Document");
    if (doc) navigate(`/editor/${docPk(doc)}`);
    else toast.error("Failed to create document");
  }, [createDoc, navigate, toast]);

  return (
    <div style={{ display: "flex", minHeight: "100vh", background: T.bg, fontFamily: T.font, color: T.fg }}>
      <Sidebar activeTab="home" onNewDoc={handleNewDoc} />
      <main style={{ flex: 1, padding: "40px 48px", overflowY: "auto" }}>
        <TopBar user={user} search={search} onSearch={setSearch} onLogout={logout} navigate={navigate} />

        {pinned.length > 0 && (
          <section style={{ marginBottom: 40 }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 20 }}>
              <h2 style={{ fontSize: 16, fontWeight: 600, color: T.fg, fontFamily: T.font }}>{search ? "Results" : "Pinned"}</h2>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 16 }}>
              {pinned.map((doc, i) => <DocCard key={docPk(doc)} doc={doc} index={i} onClick={handleOpen} />)}
            </div>
          </section>
        )}

        <section>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 20 }}>
            <h2 style={{ fontSize: 16, fontWeight: 600, color: T.fg, fontFamily: T.font }}>{search ? "More results" : "Recent Documents"}</h2>
            <button onClick={() => navigate("/documents")} style={{ fontSize: 13, color: T.primary, fontWeight: 500, background: "none", border: "none", cursor: "pointer", fontFamily: T.font }}>View all</button>
          </div>
          {loading ? (
            <div style={{ display: "flex", justifyContent: "center", padding: "60px 0" }}>
              <svg style={{ animation: "spin .8s linear infinite", width: 24, height: 24, color: T.primary }} viewBox="0 0 24 24" fill="none">
                <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" style={{ opacity: .25 }} />
                <path fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" style={{ opacity: .75 }} />
              </svg>
            </div>
          ) : recent.length === 0 && pinned.length === 0 ? (
            <div style={{ textAlign: "center", padding: "60px 0" }}>
              <p style={{ color: T.mutedFg, fontSize: 14, marginBottom: 16 }}>{search ? "No documents match." : "No documents yet."}</p>
              {!search && (
                <button onClick={handleNewDoc} style={{ background: T.primary, color: T.primFg, border: "none", borderRadius: 6, padding: "8px 20px", fontSize: 13, fontWeight: 500, cursor: "pointer", fontFamily: T.font }}>
                  Create your first document
                </button>
              )}
            </div>
          ) : (
            <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 16 }}>
              {recent.map((doc, i) => <DocCard key={docPk(doc)} doc={doc} index={i + 3} onClick={handleOpen} />)}
            </div>
          )}
        </section>
      </main>
      <style>{`@keyframes spin{to{transform:rotate(360deg)}} input::placeholder{color:${T.mutedFg}}`}</style>
    </div>
  );
}