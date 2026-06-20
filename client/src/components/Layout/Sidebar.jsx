/**
 * components/Layout/Sidebar.jsx
 * ─────────────────────────────────────────────────────────────────────────────
 * Shared sidebar used by DocumentDashboard and MyDocumentsPage.
 * Design tokens from Stitch CollabDocsHome + MyDocuments outputs.
 */

import { useState } from "react";
import { useNavigate } from "react-router-dom";

export const T = {
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

// ─── SVG Icons ────────────────────────────────────────────────────────────────
export const Icons = {
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
};

const WORKSPACES = [
    { initials: "DT", label: "Design Team", color: "#22c55e" },
    { initials: "EN", label: "Engineering", color: "#3b82f6" },
    { initials: "MK", label: "Marketing", color: "#f59e0b" },
];

const NAV_ITEMS = [
    { id: "home", icon: <Icons.Home />, label: "Home", path: "/" },
    { id: "docs", icon: <Icons.FileText />, label: "My Documents", path: "/documents" },
    { id: "shared", icon: <Icons.Users />, label: "Shared with me", path: "/shared" },
    { id: "starred", icon: <Icons.Star />, label: "Starred", path: "/starred" },
    { id: "archive", icon: <Icons.Archive />, label: "Archive", path: "/archive" },
    { id: "trash", icon: <Icons.Trash />, label: "Trash", path: "/trash" },
];

function NavItem({ icon, label, active, onClick }) {
    const [hov, setHov] = useState(false);
    return (
        <button onClick={onClick}
            onMouseEnter={() => setHov(true)}
            onMouseLeave={() => setHov(false)}
            style={{
                display: "flex", alignItems: "center", gap: 12,
                padding: "8px 12px", borderRadius: 6, width: "100%",
                background: active ? T.sec : hov ? T.muted : "none",
                border: "none", cursor: "pointer", textAlign: "left",
                color: active ? T.primary : hov ? T.fg : T.mutedFg,
                fontSize: 13, fontFamily: T.font, fontWeight: active ? 500 : 400,
                transition: "all .15s",
            }}
        >
            <span style={{ display: "flex", flexShrink: 0, color: "inherit" }}>{icon}</span>
            {label}
        </button>
    );
}

export default function Sidebar({ activeTab, onNewDoc }) {
    const navigate = useNavigate();
    return (
        <aside style={{
            width: 240, minWidth: 240, background: T.surface,
            display: "flex", flexDirection: "column",
            borderRight: `1px solid ${T.border}`, minHeight: "100vh",
            position: "sticky", top: 0,
        }}>
            {/* Logo */}
            <div style={{ padding: "20px 16px", borderBottom: `1px solid ${T.border}`, display: "flex", alignItems: "center", gap: 8 }}>
                <div style={{ width: 28, height: 28, background: T.primary, borderRadius: 6, display: "flex", alignItems: "center", justifyContent: "center", color: T.primFg }}>
                    <Icons.FilePen />
                </div>
                <span style={{ fontWeight: 600, fontSize: 16, color: T.fg, letterSpacing: "-.025em", fontFamily: T.font }}>CollabDocs</span>
            </div>

            {/* New Document */}
            <div style={{ padding: "14px 12px 6px" }}>
                <button onClick={() => navigate("/new")}
                    style={{
                        width: "100%", display: "flex", alignItems: "center", justifyContent: "center", gap: 8,
                        background: T.primary, color: T.primFg, fontSize: 13, fontWeight: 500,
                        borderRadius: 6, padding: "8px 12px", border: "none", cursor: "pointer",
                        fontFamily: T.font, transition: "opacity .15s",
                    }}
                    onMouseEnter={(e) => e.currentTarget.style.opacity = ".88"}
                    onMouseLeave={(e) => e.currentTarget.style.opacity = "1"}
                >
                    <Icons.Plus /> New Document
                </button>
            </div>

            {/* Nav */}
            <nav style={{ padding: "6px 8px", display: "flex", flexDirection: "column", gap: 1 }}>
                {NAV_ITEMS.map((item) => (
                    <NavItem key={item.id} icon={item.icon} label={item.label}
                        active={activeTab === item.id}
                        onClick={() => navigate(item.path)}
                    />
                ))}
            </nav>

            {/* Divider */}
            <div style={{ margin: "12px 16px", borderTop: `1px solid ${T.border}` }} />

            {/* Workspaces */}
            <div style={{ padding: "0 12px" }}>
                <p style={{ fontSize: 11, fontWeight: 500, color: T.mutedFg, textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: 8, paddingLeft: 4 }}>
                    Workspaces
                </p>
                <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
                    {WORKSPACES.map((ws) => {
                        const [hov, setHov] = useState(false);
                        return (
                            <button key={ws.initials}
                                onMouseEnter={() => setHov(true)}
                                onMouseLeave={() => setHov(false)}
                                style={{
                                    display: "flex", alignItems: "center", gap: 10, padding: "6px 8px",
                                    borderRadius: 6, background: hov ? T.muted : "none", border: "none",
                                    cursor: "pointer", color: hov ? T.fg : T.mutedFg, fontSize: 13,
                                    fontFamily: T.font, textAlign: "left", transition: "all .15s",
                                }}>
                                <div style={{
                                    width: 20, height: 20, borderRadius: 4, background: ws.color, flexShrink: 0,
                                    display: "flex", alignItems: "center", justifyContent: "center",
                                    fontSize: 9, fontWeight: 700, color: "#0d0d0d",
                                }}>{ws.initials}</div>
                                {ws.label}
                            </button>
                        );
                    })}
                </div>
                <button style={{ display: "flex", alignItems: "center", gap: 6, padding: "8px 8px", background: "none", border: "none", color: T.mutedFg, fontSize: 12, cursor: "pointer", fontFamily: T.font }}>
                    <Icons.Plus size={12} /> Add workspace
                </button>
            </div>

            {/* Bottom settings */}
            <div style={{ marginTop: "auto", borderTop: `1px solid ${T.border}`, padding: "14px 12px" }}>
                <button onClick={() => navigate("/settings")}
                    style={{ display: "flex", alignItems: "center", gap: 8, background: "none", border: "none", color: T.mutedFg, fontSize: 13, cursor: "pointer", fontFamily: T.font }}
                    onMouseEnter={(e) => e.currentTarget.style.color = T.fg}
                    onMouseLeave={(e) => e.currentTarget.style.color = T.mutedFg}
                >
                    <Icons.Settings /> Settings
                </button>
            </div>
        </aside>
    );
}