/**
 * pages/DocumentDashboard.jsx
 * ─────────────────────────────────────────────────────────────────────────────
 * Converted from Google Stitch (CollabDocsHome.jsx) → production React.
 *
 * Design tokens (from Stitch):
 *   background  #0d0d0d  |  surface    #141414
 *   foreground  #f0f0f0  |  border     #222222
 *   primary     #22c55e  |  primary-fg #0d0d0d
 *   secondary   #1a2e22  |  secondary-fg #22c55e
 *   muted       #1c1c1c  |  muted-fg   #666666
 *   font        Geist (headings + body)
 *
 * Features wired:
 *   - Real documents from useDocument() hook (pinned = first 3, recent = rest)
 *   - Greeting based on time of day + real user name
 *   - Profile dropdown with View Profile / Settings / Notifications / Appearance / Sign out
 *   - Search with live filtering
 *   - Create new document (FAB + sidebar button)
 *   - Navigate to editor on card click
 *   - Bell notification dot
 *   - Workspace badges
 */

import { useState, useEffect, useCallback, useRef, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { useDocument } from "../hooks/useDocument";
import { useToast } from "../components/UI/Toast";
import { useAuthStore } from "../store/authSlice";

// ─── SVG Icon library (inlined from Stitch output) ───────────────────────────
const Icons = {
  FilePen: () => (
    <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12.659 22H18a2 2 0 0 0 2-2V8a2.4 2.4 0 0 0-.706-1.706l-3.588-3.588A2.4 2.4 0 0 0 14 2H6a2 2 0 0 0-2 2v9.34" />
      <path d="M14 2v5a1 1 0 0 0 1 1h5m-9.622 4.622a1 1 0 0 1 3 3.003L8.36 20.637a2 2 0 0 1-.854.506l-2.867.837a.5.5 0 0 1-.62-.62l.836-2.869a2 2 0 0 1 .506-.853z" />
    </svg>
  ),
  Plus: ({ size = 14 }) => (
    <svg xmlns="http://www.w3.org/2000/svg" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M5 12h14m-7-7v14" />
    </svg>
  ),
  Home: () => (
    <svg xmlns="http://www.w3.org/2000/svg" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round">
      <path d="M15 21v-8a1 1 0 0 0-1-1h-4a1 1 0 0 0-1 1v8" />
      <path d="M3 10a2 2 0 0 1 .709-1.528l7-6a2 2 0 0 1 2.582 0l7 6A2 2 0 0 1 21 10v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
    </svg>
  ),
  FileText: ({ size = 15 }) => (
    <svg xmlns="http://www.w3.org/2000/svg" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round">
      <path d="M6 22a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h8a2.4 2.4 0 0 1 1.704.706l3.588 3.588A2.4 2.4 0 0 1 20 8v12a2 2 0 0 1-2 2z" />
      <path d="M14 2v5a1 1 0 0 0 1 1h5M10 9H8m8 4H8m8 4H8" />
    </svg>
  ),
  Users: () => (
    <svg xmlns="http://www.w3.org/2000/svg" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round">
      <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2M16 3.128a4 4 0 0 1 0 7.744M22 21v-2a4 4 0 0 0-3-3.87" />
      <circle cx="9" cy="7" r="4" />
    </svg>
  ),
  Star: () => (
    <svg xmlns="http://www.w3.org/2000/svg" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round">
      <path d="M11.525 2.295a.53.53 0 0 1 .95 0l2.31 4.679a2.12 2.12 0 0 0 1.595 1.16l5.166.756a.53.53 0 0 1 .294.904l-3.736 3.638a2.12 2.12 0 0 0-.611 1.878l.882 5.14a.53.53 0 0 1-.771.56l-4.618-2.428a2.12 2.12 0 0 0-1.973 0L6.396 21.01a.53.53 0 0 1-.77-.56l.881-5.139a2.12 2.12 0 0 0-.611-1.879L2.16 9.795a.53.53 0 0 1 .294-.906l5.165-.755a2.12 2.12 0 0 0 1.597-1.16z" />
    </svg>
  ),
  Archive: () => (
    <svg xmlns="http://www.w3.org/2000/svg" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round">
      <rect width="20" height="5" x="2" y="3" rx="1" />
      <path d="M4 8v11a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8m-10 4h4" />
    </svg>
  ),
  Trash: () => (
    <svg xmlns="http://www.w3.org/2000/svg" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round">
      <path d="M10 11v6m4-6v6m5-11v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6M3 6h18M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
    </svg>
  ),
  Settings: ({ size = 15 }) => (
    <svg xmlns="http://www.w3.org/2000/svg" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round">
      <path d="M9.671 4.136a2.34 2.34 0 0 1 4.659 0a2.34 2.34 0 0 0 3.319 1.915a2.34 2.34 0 0 1 2.33 4.033a2.34 2.34 0 0 0 0 3.831a2.34 2.34 0 0 1-2.33 4.033a2.34 2.34 0 0 0-3.319 1.915a2.34 2.34 0 0 1-4.659 0a2.34 2.34 0 0 0-3.32-1.915a2.34 2.34 0 0 1-2.33-4.033a2.34 2.34 0 0 0 0-3.831A2.34 2.34 0 0 1 6.35 6.051a2.34 2.34 0 0 0 3.319-1.915" />
      <circle cx="12" cy="12" r="3" />
    </svg>
  ),
  Search: () => (
    <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="m21 21-4.34-4.34" />
      <circle cx="11" cy="11" r="8" />
    </svg>
  ),
  Bell: ({ size = 16 }) => (
    <svg xmlns="http://www.w3.org/2000/svg" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round">
      <path d="M10.268 21a2 2 0 0 0 3.464 0m-10.47-5.674A1 1 0 0 0 4 17h16a1 1 0 0 0 .74-1.673C19.41 13.956 18 12.499 18 8A6 6 0 0 0 6 8c0 4.499-1.411 5.956-2.738 7.326" />
    </svg>
  ),
  User: ({ size = 14 }) => (
    <svg xmlns="http://www.w3.org/2000/svg" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2" />
      <circle cx="12" cy="7" r="4" />
    </svg>
  ),
  Moon: () => (
    <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M20.985 12.486a9 9 0 1 1-9.473-9.472c.405-.022.617.46.402.803a6 6 0 0 0 8.268 8.268c.344-.215.825-.004.803.401" />
    </svg>
  ),
  LogOut: () => (
    <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="m16 17 5-5-5-5m5 5H9m0 9H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
    </svg>
  ),
  Map: () => (
    <svg xmlns="http://www.w3.org/2000/svg" width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
      <path d="M14.106 5.553a2 2 0 0 0 1.788 0l3.659-1.83A1 1 0 0 1 21 4.619v12.764a1 1 0 0 1-.553.894l-4.553 2.277a2 2 0 0 1-1.788 0l-4.212-2.106a2 2 0 0 0-1.788 0l-3.659 1.83A1 1 0 0 1 3 19.381V6.618a1 1 0 0 1 .553-.894l4.553-2.277a2 2 0 0 1 1.788 0zm.894.211v15M9 3.236v15" />
    </svg>
  ),
  Target: () => (
    <svg xmlns="http://www.w3.org/2000/svg" width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="10" />
      <circle cx="12" cy="12" r="6" />
      <circle cx="12" cy="12" r="2" />
    </svg>
  ),
  Code: () => (
    <svg xmlns="http://www.w3.org/2000/svg" width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
      <path d="m18 16 4-4-4-4M6 8l-4 4 4 4m8.5-12-5 16" />
    </svg>
  ),
};

// ─── Helpers ──────────────────────────────────────────────────────────────────
function getGreeting() {
  const h = new Date().getHours();
  if (h < 12) return "Good morning";
  if (h < 17) return "Good afternoon";
  return "Good evening";
}

function getFormattedDate() {
  return new Date().toLocaleDateString("en-US", {
    weekday: "long", month: "long", day: "numeric",
  });
}

function fmtDate(d) {
  if (!d) return "—";
  const dt = new Date(d);
  const now = new Date();
  const diff = now - dt;
  const mins = Math.round(diff / 60000);
  const hrs = Math.round(diff / 3600000);
  if (mins < 60) return `${mins}m ago`;
  if (hrs < 24) return `Today at ${dt.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })}`;
  if (hrs < 48) return `Yesterday at ${dt.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })}`;
  return dt.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });
}

function docPk(doc) { return doc?._id ?? doc?.id ?? ""; }

function ownerName(owner) {
  if (!owner) return "Unknown";
  if (typeof owner === "object") return owner.name ?? owner.email ?? "Unknown";
  return String(owner);
}

function userInitials(name) {
  if (!name) return "?";
  return name.split(" ").map((n) => n[0]).join("").toUpperCase().slice(0, 2);
}

// Assign a deterministic icon + category color from document title
const ICONS_LIST = [Icons.FileText, Icons.Map, Icons.Target, Icons.Code];
const TAG_COLORS = {
  Product: { bg: "#1a2e22", text: "#22c55e" },
  Design: { bg: "#1a2e22", text: "#22c55e" },
  Engineering: { bg: "#1c1c1c", text: "#666666" },
  Research: { bg: "#1c1c1c", text: "#666666" },
  Finance: { bg: "#1c1c1c", text: "#666666" },
  Marketing: { bg: "#1c1c1c", text: "#666666" },
};
function inferCategory(title = "") {
  const t = title.toLowerCase();
  if (t.includes("design") || t.includes("brand") || t.includes("ui") || t.includes("ux")) return "Design";
  if (t.includes("engineer") || t.includes("api") || t.includes("code") || t.includes("sprint")) return "Engineering";
  if (t.includes("research") || t.includes("survey") || t.includes("user")) return "Research";
  if (t.includes("market") || t.includes("copy") || t.includes("campaign")) return "Marketing";
  if (t.includes("finance") || t.includes("investor") || t.includes("budget") || t.includes("revenue")) return "Finance";
  return "Product";
}
function docIcon(idx) {
  const Icon = ICONS_LIST[idx % ICONS_LIST.length];
  return <Icon />;
}

// ─── Design-token styles (CSS-in-JS, matches Stitch tokens exactly) ──────────
const T = {
  bg: "#0d0d0d",
  surface: "#141414",
  fg: "#f0f0f0",
  border: "#222222",
  primary: "#22c55e",
  primFg: "#0d0d0d",
  sec: "#1a2e22",
  secFg: "#22c55e",
  muted: "#1c1c1c",
  mutedFg: "#666666",
  font: "'Geist', 'DM Sans', sans-serif",
};

// ─── ProfileDropdown ──────────────────────────────────────────────────────────
function ProfileDropdown({ user, open, onClose, onLogout, navigate }) {
  const ref = useRef(null);

  useEffect(() => {
    if (!open) return;
    const handler = (e) => { if (!ref.current?.contains(e.target)) onClose(); };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open, onClose]);

  if (!open) return null;

  const items = [
    { icon: <Icons.User />, label: "View Profile", action: () => { navigate("/settings/profile"); onClose(); } },
    { icon: <Icons.Settings size={14} />, label: "Account Settings", action: () => { navigate("/settings"); onClose(); } },
    { icon: <Icons.Bell size={14} />, label: "Notifications", action: () => { onClose(); } },
    { icon: <Icons.Moon />, label: "Appearance", action: () => { onClose(); } },
  ];

  return (
    <div ref={ref} style={{
      position: "absolute", right: 0, top: 44, width: 224,
      background: T.surface, border: `1px solid ${T.border}`,
      borderRadius: 8, overflow: "hidden", zIndex: 50,
      boxShadow: "0 8px 30px rgba(0,0,0,0.5)",
    }}>
      {/* User info header */}
      <div style={{ padding: "12px 16px", borderBottom: `1px solid ${T.border}`, display: "flex", alignItems: "center", gap: 10 }}>
        <div style={{
          width: 32, height: 32, borderRadius: "50%",
          background: `linear-gradient(135deg, ${T.primary}, #16a34a)`,
          display: "flex", alignItems: "center", justifyContent: "center",
          fontSize: 11, fontWeight: 700, color: T.primFg, flexShrink: 0,
        }}>
          {userInitials(user?.name)}
        </div>
        <div style={{ minWidth: 0 }}>
          <div style={{ fontSize: 13, fontWeight: 500, color: T.fg, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            {user?.name ?? "User"}
          </div>
          <div style={{ fontSize: 11, color: T.mutedFg, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            {user?.email ?? ""}
          </div>
        </div>
      </div>

      {/* Menu items */}
      <div style={{ padding: "4px 0" }}>
        {items.map(({ icon, label, action }) => (
          <button key={label} onClick={action}
            style={{
              width: "100%", display: "flex", alignItems: "center", gap: 12,
              padding: "10px 16px", background: "none", border: "none",
              color: T.mutedFg, fontSize: 13, cursor: "pointer", textAlign: "left",
              transition: "background .15s, color .15s",
              fontFamily: T.font,
            }}
            onMouseEnter={(e) => { e.currentTarget.style.background = T.muted; e.currentTarget.style.color = T.fg; }}
            onMouseLeave={(e) => { e.currentTarget.style.background = "none"; e.currentTarget.style.color = T.mutedFg; }}
          >
            <span style={{ color: T.mutedFg, display: "flex", flexShrink: 0 }}>{icon}</span>
            {label}
          </button>
        ))}
      </div>

      {/* Sign out */}
      <div style={{ borderTop: `1px solid ${T.border}`, padding: "4px 0" }}>
        <button onClick={() => { onLogout(); onClose(); navigate("/auth"); }}
          style={{
            width: "100%", display: "flex", alignItems: "center", gap: 12,
            padding: "10px 16px", background: "none", border: "none",
            color: "#ef4444", fontSize: 13, cursor: "pointer", textAlign: "left",
            fontFamily: T.font, transition: "background .15s",
          }}
          onMouseEnter={(e) => e.currentTarget.style.background = "rgba(239,68,68,.08)"}
          onMouseLeave={(e) => e.currentTarget.style.background = "none"}
        >
          <Icons.LogOut />
          Sign out
        </button>
      </div>
    </div>
  );
}

// ─── DocCard ──────────────────────────────────────────────────────────────────
function DocCard({ doc, index, onClick }) {
  const [hovered, setHovered] = useState(false);
  const cat = inferCategory(doc.title ?? "");
  const tagStyle = TAG_COLORS[cat] ?? TAG_COLORS.Product;

  return (
    <button
      onClick={() => onClick(doc)}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        display: "flex", flexDirection: "column", gap: 16,
        background: hovered ? "#1a1a1a" : T.surface,
        borderRadius: 8, border: `1px solid ${hovered ? "#333" : T.border}`,
        padding: 20, cursor: "pointer", textAlign: "left",
        transition: "background .15s, border-color .15s",
        width: "100%",
      }}
    >
      {/* Card header */}
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 12 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          {/* Icon */}
          <div style={{
            width: 36, height: 36, background: T.muted, borderRadius: 6,
            display: "flex", alignItems: "center", justifyContent: "center",
            color: T.primary, flexShrink: 0,
          }}>
            {docIcon(index)}
          </div>
          {/* Title + date */}
          <div>
            <p style={{ fontSize: 14, fontWeight: 500, color: T.fg, lineHeight: 1.3, marginBottom: 2 }}>
              {doc.title ?? "Untitled Document"}
            </p>
            <p style={{ fontSize: 11, color: T.mutedFg }}>
              {fmtDate(doc.updatedAt ?? doc.createdAt)}
            </p>
          </div>
        </div>
        {/* Category tag */}
        <div style={{
          fontSize: 11, fontWeight: 500, padding: "2px 8px", borderRadius: 4,
          background: tagStyle.bg, color: tagStyle.text, flexShrink: 0,
        }}>
          {cat}
        </div>
      </div>

      {/* Card footer — owner */}
      <div style={{
        display: "flex", alignItems: "center", gap: 8,
        paddingTop: 12, borderTop: `1px solid ${T.border}`,
      }}>
        <div style={{
          width: 20, height: 20, borderRadius: "50%",
          background: `linear-gradient(135deg, ${T.primary}, #16a34a)`,
          display: "flex", alignItems: "center", justifyContent: "center",
          fontSize: 8, fontWeight: 700, color: T.primFg, flexShrink: 0,
        }}>
          {userInitials(ownerName(doc.owner))}
        </div>
        <span style={{ fontSize: 11, color: T.mutedFg }}>
          {ownerName(doc.owner)}
        </span>
      </div>
    </button>
  );
}

// ─── Sidebar nav item ─────────────────────────────────────────────────────────
function NavItem({ icon, label, active, onClick }) {
  const [hovered, setHovered] = useState(false);
  return (
    <button onClick={onClick}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        display: "flex", alignItems: "center", gap: 12,
        padding: "8px 12px", borderRadius: 6, width: "100%",
        background: active ? T.sec : hovered ? T.muted : "none",
        border: "none", cursor: "pointer", textAlign: "left",
        color: active ? T.primary : hovered ? T.fg : T.mutedFg,
        fontSize: 13, fontFamily: T.font, fontWeight: active ? 500 : 400,
        transition: "background .15s, color .15s",
      }}
    >
      <span style={{ display: "flex", flexShrink: 0, color: "inherit" }}>{icon}</span>
      {label}
    </button>
  );
}

// ─── Sidebar ──────────────────────────────────────────────────────────────────
const WORKSPACES = [
  { initials: "DT", label: "Design Team", color: "#22c55e" },
  { initials: "EN", label: "Engineering", color: "#3b82f6" },
  { initials: "MK", label: "Marketing", color: "#f59e0b" },
];

function Sidebar({ activeTab, onTabChange, onNewDoc }) {
  const navigate = useNavigate();

  const navItems = [
    { id: "home", icon: <Icons.Home />, label: "Home" },
    { id: "docs", icon: <Icons.FileText />, label: "My Documents" },
    { id: "shared", icon: <Icons.Users />, label: "Shared with me" },
    { id: "starred", icon: <Icons.Star />, label: "Starred" },
    { id: "archive", icon: <Icons.Archive />, label: "Archive" },
    { id: "trash", icon: <Icons.Trash />, label: "Trash" },
  ];

  return (
    <div style={{
      width: 240, minWidth: 240, background: T.surface, display: "flex", flexDirection: "column",
      borderRight: `1px solid ${T.border}`, minHeight: "100vh",
    }}>
      {/* Logo */}
      <div style={{ padding: "20px", borderBottom: `1px solid ${T.border}`, display: "flex", alignItems: "center", gap: 8 }}>
        <div style={{ width: 28, height: 28, background: T.primary, borderRadius: 6, display: "flex", alignItems: "center", justifyContent: "center", color: T.primFg }}>
          <Icons.FilePen />
        </div>
        <span style={{ fontWeight: 600, fontSize: 16, color: T.fg, letterSpacing: "-.025em" }}>CollabDocs</span>
      </div>

      {/* New Doc button */}
      <div style={{ padding: "16px 16px 8px" }}>
        <button onClick={onNewDoc}
          style={{
            width: "100%", display: "flex", alignItems: "center", justifyContent: "center", gap: 8,
            background: T.primary, color: T.primFg, fontSize: 13, fontWeight: 500,
            borderRadius: 6, padding: "8px 12px", border: "none", cursor: "pointer",
            fontFamily: T.font, transition: "opacity .15s",
          }}
          onMouseEnter={(e) => e.currentTarget.style.opacity = ".9"}
          onMouseLeave={(e) => e.currentTarget.style.opacity = "1"}
        >
          <Icons.Plus />
          New Document
        </button>
      </div>

      {/* Nav */}
      <nav style={{ padding: "8px 8px 0", display: "flex", flexDirection: "column", gap: 2 }}>
        {navItems.map((item) => (
          <NavItem key={item.id} icon={item.icon} label={item.label}
            active={activeTab === item.id}
            onClick={() => onTabChange(item.id)}
          />
        ))}
      </nav>

      {/* Divider */}
      <div style={{ margin: "16px", borderTop: `1px solid ${T.border}` }} />

      {/* Workspaces */}
      <div style={{ padding: "0 16px" }}>
        <p style={{ fontSize: 11, fontWeight: 500, color: T.mutedFg, textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: 10 }}>
          Workspaces
        </p>
        <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
          {WORKSPACES.map((ws) => (
            <button key={ws.initials}
              style={{
                display: "flex", alignItems: "center", gap: 10, padding: "6px 4px",
                borderRadius: 6, background: "none", border: "none", cursor: "pointer",
                color: T.mutedFg, fontSize: 13, fontFamily: T.font, textAlign: "left",
                transition: "background .15s, color .15s",
              }}
              onMouseEnter={(e) => { e.currentTarget.style.background = T.muted; e.currentTarget.style.color = T.fg; }}
              onMouseLeave={(e) => { e.currentTarget.style.background = "none"; e.currentTarget.style.color = T.mutedFg; }}
            >
              <div style={{
                width: 20, height: 20, borderRadius: 4, background: ws.color,
                display: "flex", alignItems: "center", justifyContent: "center",
                fontSize: 9, fontWeight: 600, color: "#0d0d0d", flexShrink: 0,
              }}>
                {ws.initials}
              </div>
              {ws.label}
            </button>
          ))}
        </div>
        <button style={{ display: "flex", alignItems: "center", gap: 6, padding: "8px 4px", background: "none", border: "none", color: T.mutedFg, fontSize: 12, cursor: "pointer", fontFamily: T.font }}>
          <Icons.Plus size={12} />
          Add workspace
        </button>
      </div>

      {/* Bottom settings */}
      <div style={{ marginTop: "auto", borderTop: `1px solid ${T.border}`, padding: "16px" }}>
        <button onClick={() => navigate("/settings")}
          style={{ display: "flex", alignItems: "center", gap: 8, background: "none", border: "none", color: T.mutedFg, fontSize: 13, cursor: "pointer", fontFamily: T.font }}
          onMouseEnter={(e) => e.currentTarget.style.color = T.fg}
          onMouseLeave={(e) => e.currentTarget.style.color = T.mutedFg}
        >
          <Icons.Settings />
          Settings
        </button>
      </div>
    </div>
  );
}

// ─── ROOT: DocumentDashboard ──────────────────────────────────────────────────
export default function DocumentDashboard() {
  const navigate = useNavigate();
  const { toast } = useToast();
  const user = useAuthStore((s) => s.user);
  const logout = useAuthStore((s) => s.logout);

  const { loading, loadDocuments, createDoc } = useDocument();

  const [documents, setDocuments] = useState([]);
  const [search, setSearch] = useState("");
  const [activeTab, setActiveTab] = useState("home");
  const [profileOpen, setProfileOpen] = useState(false);

  // Load docs on mount
  useEffect(() => {
    loadDocuments()
      .then((data) => {
        if (Array.isArray(data?.documents)) setDocuments(data.documents);
      })
      .catch(() => { });
  }, []);

  // Filter by search
  const filtered = useMemo(() => {
    if (!search.trim()) return documents;
    const q = search.toLowerCase();
    return documents.filter((d) => (d.title ?? "").toLowerCase().includes(q));
  }, [documents, search]);

  // Split into pinned (first 3) and recent (rest), max 6 recent
  const pinned = filtered.slice(0, 3);
  const recent = filtered.slice(3, 9);

  const handleOpen = useCallback((doc) => navigate(`/editor/${docPk(doc)}`), [navigate]);

  const handleNewDoc = useCallback(async () => {
    const doc = await createDoc("Untitled Document");
    if (doc) navigate(`/editor/${docPk(doc)}`);
    else toast.error("Failed to create document");
  }, [createDoc, navigate, toast]);

  const firstName = user?.name?.split(" ")[0] ?? "there";

  return (
    <div style={{ display: "flex", minHeight: "100vh", background: T.bg, fontFamily: T.font, color: T.fg }}>

      {/* ── Sidebar ────────────────────────────────────────────────────────── */}
      <Sidebar activeTab={activeTab} onTabChange={setActiveTab} onNewDoc={handleNewDoc} />

      {/* ── Main content ───────────────────────────────────────────────────── */}
      <div style={{ flex: 1, padding: "40px 48px", overflowY: "auto" }}>

        {/* Top bar: greeting + search + bell + profile */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 40 }}>

          {/* Greeting */}
          <div>
            <p style={{ fontSize: 11, color: T.primary, fontWeight: 500, textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: 4 }}>
              {getFormattedDate()}
            </p>
            <h1 style={{ fontSize: 30, fontWeight: 600, color: T.fg, letterSpacing: "-.025em", lineHeight: 1.25 }}>
              {getGreeting()}, {firstName}
            </h1>
          </div>

          {/* Right controls */}
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>

            {/* Search */}
            <div style={{
              display: "flex", alignItems: "center", gap: 8,
              background: T.surface, border: `1px solid ${T.border}`,
              borderRadius: 6, padding: "8px 12px", width: 224,
              color: T.mutedFg, fontSize: 13,
            }}>
              <Icons.Search />
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search documents..."
                style={{
                  background: "none", border: "none", outline: "none",
                  color: T.fg, fontSize: 13, fontFamily: T.font, width: "100%",
                }}
              />
            </div>

            {/* Bell */}
            <div style={{
              width: 36, height: 36, background: T.surface, border: `1px solid ${T.border}`,
              borderRadius: 6, display: "flex", alignItems: "center", justifyContent: "center",
              color: T.mutedFg, position: "relative", cursor: "pointer", flexShrink: 0,
            }}>
              <Icons.Bell />
              <div style={{
                position: "absolute", top: 8, right: 8,
                width: 6, height: 6, background: T.primary, borderRadius: "50%",
              }} />
            </div>

            {/* Profile avatar + dropdown */}
            <div style={{ position: "relative" }}>
              <button onClick={() => setProfileOpen((o) => !o)}
                style={{
                  width: 36, height: 36, borderRadius: "50%",
                  background: `linear-gradient(135deg, ${T.primary}, #16a34a)`,
                  border: `2px solid ${T.primary}`,
                  display: "flex", alignItems: "center", justifyContent: "center",
                  fontSize: 12, fontWeight: 700, color: T.primFg,
                  cursor: "pointer", flexShrink: 0,
                }}
              >
                {userInitials(user?.name)}
              </button>
              <ProfileDropdown
                user={user}
                open={profileOpen}
                onClose={() => setProfileOpen(false)}
                onLogout={logout}
                navigate={navigate}
              />
            </div>
          </div>
        </div>

        {/* ── Pinned section ─────────────────────────────────────────────── */}
        {pinned.length > 0 && (
          <div style={{ marginBottom: 40 }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 20 }}>
              <h2 style={{ fontSize: 16, fontWeight: 600, color: T.fg }}>
                {search ? "Results" : "Pinned"}
              </h2>
              <button style={{ fontSize: 13, color: T.primary, fontWeight: 500, background: "none", border: "none", cursor: "pointer" }}>
                Manage
              </button>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 16 }}>
              {pinned.map((doc, i) => (
                <DocCard key={docPk(doc)} doc={doc} index={i} onClick={handleOpen} />
              ))}
            </div>
          </div>
        )}

        {/* ── Recent Documents section ────────────────────────────────────── */}
        <div>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 20 }}>
            <h2 style={{ fontSize: 16, fontWeight: 600, color: T.fg }}>
              {search ? "More results" : "Recent Documents"}
            </h2>
            <button style={{ fontSize: 13, color: T.primary, fontWeight: 500, background: "none", border: "none", cursor: "pointer" }}>
              View all
            </button>
          </div>

          {loading ? (
            <div style={{ display: "flex", alignItems: "center", justifyContent: "center", padding: "60px 0" }}>
              <svg style={{ animation: "spin .8s linear infinite", width: 24, height: 24, color: T.primary }} viewBox="0 0 24 24" fill="none">
                <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" style={{ opacity: .25 }} />
                <path fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" style={{ opacity: .75 }} />
              </svg>
            </div>
          ) : recent.length === 0 && pinned.length === 0 ? (
            <div style={{ textAlign: "center", padding: "60px 0" }}>
              <p style={{ color: T.mutedFg, fontSize: 14, marginBottom: 16 }}>
                {search ? "No documents match your search." : "No documents yet."}
              </p>
              {!search && (
                <button onClick={handleNewDoc}
                  style={{
                    background: T.primary, color: T.primFg, border: "none",
                    borderRadius: 6, padding: "8px 20px", fontSize: 13, fontWeight: 500,
                    cursor: "pointer", fontFamily: T.font,
                  }}>
                  Create your first document
                </button>
              )}
            </div>
          ) : (
            <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 16 }}>
              {recent.map((doc, i) => (
                <DocCard key={docPk(doc)} doc={doc} index={i + 3} onClick={handleOpen} />
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Spin keyframe */}
      <style>{`@keyframes spin { to { transform: rotate(360deg); } } input::placeholder { color: ${T.mutedFg}; }`}</style>
    </div>
  );
}