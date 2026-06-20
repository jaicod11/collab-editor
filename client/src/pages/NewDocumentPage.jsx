/**
 * pages/NewDocumentPage.jsx
 * ─────────────────────────────────────────────────────────────────────────────
 * Template picker shown when user clicks "+ New Document".
 * Built from scratch to match the CollabDocs design system.
 *
 * Features:
 *  - Document title input
 *  - Workspace dropdown
 *  - Category filter pills
 *  - 8 template cards (Blank + 7 categories) in a 4-col grid
 *  - Selected card gets green border + glow
 *  - "Import from file" — reads .txt/.md and creates doc with that content
 *  - "Create Document" — creates doc via API, navigates to editor
 *  - "Cancel" — goes back
 */

import { useState, useCallback, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { useToast } from "../components/UI/Toast";
import { useAuthStore } from "../store/authSlice";
import Sidebar, { T, Icons } from "../components/Layout/Sidebar";
import api from "../services/api";

// ─── Category tag colors ──────────────────────────────────────────────────────
const CAT = {
    General: { bg: "rgba(122,122,122,.15)", text: "#9a9a9a", icon: "#9a9a9a" },
    Product: { bg: "rgba(61,220,110,.15)", text: "#3ddc6e", icon: "#3ddc6e" },
    Design: { bg: "rgba(224,92,42,.15)", text: "#e05c2a", icon: "#e05c2a" },
    Engineering: { bg: "rgba(42,122,224,.15)", text: "#2a7ae0", icon: "#2a7ae0" },
    Research: { bg: "rgba(200,168,0,.15)", text: "#c8a800", icon: "#c8a800" },
    Finance: { bg: "rgba(139,42,224,.15)", text: "#8b2ae0", icon: "#8b2ae0" },
    Marketing: { bg: "rgba(224,42,106,.15)", text: "#e02a6a", icon: "#e02a6a" },
};

const FILTERS = ["All Templates", "General", "Product", "Design", "Engineering", "Research", "Finance", "Marketing"];

const WORKSPACES = [
    { id: "none", label: "No workspace" },
    { id: "dt", label: "Design Team" },
    { id: "eng", label: "Engineering" },
    { id: "mkt", label: "Marketing" },
];

// ─── Template card icons ──────────────────────────────────────────────────────
const TemplateIcons = {
    blank: (c) => <svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M6 22a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h8a2.4 2.4 0 0 1 1.704.706l3.588 3.588A2.4 2.4 0 0 1 20 8v12a2 2 0 0 1-2 2z" /><path d="M14 2v5a1 1 0 0 0 1 1h5" /></svg>,
    map: (c) => <svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M14.106 5.553a2 2 0 0 0 1.788 0l3.659-1.83A1 1 0 0 1 21 4.619v12.764a1 1 0 0 1-.553.894l-4.553 2.277a2 2 0 0 1-1.788 0l-4.212-2.106a2 2 0 0 0-1.788 0l-3.659 1.83A1 1 0 0 1 3 19.381V6.618a1 1 0 0 1 .553-.894l4.553-2.277a2 2 0 0 1 1.788 0zm.894.211v15M9 3.236v15" /></svg>,
    book: (c) => <svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z" /><path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z" /></svg>,
    code: (c) => <svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="m18 16 4-4-4-4M6 8l-4 4 4 4m8.5-12-5 16" /></svg>,
    clip: (c) => <svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><rect width="8" height="4" x="8" y="2" rx="1" ry="1" /><path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2" /><path d="M12 11h4m-4 4h4m-8-4h.01M8 15h.01" /></svg>,
    pres: (c) => <svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M2 3h20m-1 0v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V3" /><path d="m7 21 5-5 5 5" /></svg>,
    mega: (c) => <svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="m3 11 19-9-9 19-2-8-8-2z" /></svg>,
    users: (c) => <svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /><path d="M22 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75" /></svg>,
};

// ─── Template definitions ─────────────────────────────────────────────────────
const TEMPLATES = [
    {
        id: "blank",
        title: "Blank Document",
        description: "Start from scratch with an empty document.",
        category: "General",
        iconKey: "blank",
        isBlank: true,
        content: "",
        previewLines: [80, 60, 90, 40],
    },
    {
        id: "product-roadmap",
        title: "Product Roadmap",
        description: "Plan features, milestones and priorities for your product.",
        category: "Product",
        iconKey: "map",
        content: "Product Roadmap\n\nQ1 Goals\n\nQ2 Goals\n\nKey Milestones\n\nRisks & Dependencies",
        previewLines: [100, 70, 90, 50, 80],
    },
    {
        id: "brand-guidelines",
        title: "Brand Guidelines",
        description: "Document brand colors, fonts, tone of voice and usage rules.",
        category: "Design",
        iconKey: "book",
        content: "Brand Guidelines\n\nBrand Colors\n\nTypography\n\nTone of Voice\n\nLogo Usage\n\nDo & Don't",
        previewLines: [90, 100, 65, 80, 55],
    },
    {
        id: "engineering-spec",
        title: "Engineering Spec",
        description: "Define system architecture, APIs, and technical requirements.",
        category: "Engineering",
        iconKey: "code",
        content: "Engineering Spec\n\nOverview\n\nSystem Architecture\n\nAPI Design\n\nDatabase Schema\n\nRequirements",
        previewLines: [85, 60, 100, 70, 45],
    },
    {
        id: "research-synthesis",
        title: "Research Synthesis",
        description: "Capture insights, findings, and recommendations from research.",
        category: "Research",
        iconKey: "clip",
        content: "Research Synthesis\n\nExecutive Summary\n\nKey Findings\n\nUser Insights\n\nRecommendations\n\nNext Steps",
        previewLines: [100, 80, 60, 90, 50],
    },
    {
        id: "investor-deck",
        title: "Investor Deck",
        description: "Create a pitch deck with narrative and supporting data slides.",
        category: "Finance",
        iconKey: "pres",
        content: "Investor Deck\n\nProblem\n\nSolution\n\nMarket Size\n\nBusiness Model\n\nTraction\n\nTeam\n\nFunding Ask",
        previewLines: [70, 100, 85, 60, 95],
    },
    {
        id: "marketing-brief",
        title: "Marketing Brief",
        description: "Outline campaign goals, audience, messaging and channels.",
        category: "Marketing",
        iconKey: "mega",
        content: "Marketing Brief\n\nCampaign Goals\n\nTarget Audience\n\nKey Messages\n\nChannels & Tactics\n\nBudget\n\nTimeline",
        previewLines: [90, 65, 100, 75, 55],
    },
    {
        id: "meeting-notes",
        title: "Meeting Notes",
        description: "Capture agenda, decisions and action items from meetings.",
        category: "General",
        iconKey: "users",
        content: "Meeting Notes\n\nDate & Attendees\n\nAgenda\n\nDiscussion Points\n\nDecisions Made\n\nAction Items\n\nNext Meeting",
        previewLines: [100, 70, 90, 60, 80],
    },
];

// ─── Template card ────────────────────────────────────────────────────────────
function TemplateCard({ template, selected, onClick }) {
    const [hov, setHov] = useState(false);
    const cat = CAT[template.category] ?? CAT.General;
    const active = selected || hov;

    return (
        <button
            onClick={onClick}
            onMouseEnter={() => setHov(true)}
            onMouseLeave={() => setHov(false)}
            style={{
                background: T.surface, borderRadius: 10, overflow: "hidden",
                border: selected
                    ? `2px solid ${T.primary}`
                    : `2px solid ${hov ? "#3a3a3a" : T.border}`,
                cursor: "pointer", textAlign: "left", padding: 0, width: "100%",
                transition: "all .18s",
                boxShadow: selected ? `0 0 0 3px rgba(61,220,110,.15)` : "none",
            }}
        >
            {/* Preview area */}
            <div style={{
                height: 148, background: "#1a1a1a", position: "relative",
                display: "flex", flexDirection: "column",
                justifyContent: "space-between", padding: 14,
            }}>
                {/* Icon top-left */}
                <div style={{
                    width: 36, height: 36, borderRadius: 8,
                    background: template.isBlank ? "rgba(255,255,255,.06)" : cat.bg,
                    display: "flex", alignItems: "center", justifyContent: "center",
                    flexShrink: 0,
                }}>
                    {TemplateIcons[template.iconKey]?.(
                        template.isBlank ? "#555" : cat.icon
                    )}
                </div>

                {/* Category badge top-right (not on blank) */}
                {!template.isBlank && (
                    <div style={{ position: "absolute", top: 14, right: 14 }}>
                        <span style={{ fontSize: 10, fontWeight: 600, padding: "2px 8px", borderRadius: 4, background: cat.bg, color: cat.text }}>
                            {template.category}
                        </span>
                    </div>
                )}

                {/* Preview lines bottom */}
                <div style={{ display: "flex", flexDirection: "column", gap: 5, marginTop: "auto", paddingTop: 20 }}>
                    {template.previewLines.slice(0, 3).map((w, i) => (
                        <div key={i} style={{ height: 7, borderRadius: 3, background: "rgba(255,255,255,.07)", width: `${w}%` }} />
                    ))}
                </div>
            </div>

            {/* Card body */}
            <div style={{ padding: "14px 16px 16px" }}>
                <p style={{ fontSize: 14, fontWeight: 600, color: selected ? T.primary : T.fg, marginBottom: 5, transition: "color .15s" }}>
                    {template.title}
                </p>
                <p style={{ fontSize: 12, color: T.mutedFg, lineHeight: 1.6 }}>
                    {template.description}
                </p>
            </div>
        </button>
    );
}

// ─── Profile dropdown ─────────────────────────────────────────────────────────
function ProfileDropdown({ user, open, onClose, onLogout, navigate }) {
    const ref = useRef(null);
    const userInitials = (n) => !n ? "?" : n.split(" ").map(x => x[0]).join("").toUpperCase().slice(0, 2);

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

// ─── ROOT: NewDocumentPage ────────────────────────────────────────────────────
export default function NewDocumentPage() {
    const navigate = useNavigate();
    const { toast } = useToast();
    const user = useAuthStore((s) => s.user);
    const logout = useAuthStore((s) => s.logout);
    const userInitials = (n) => !n ? "?" : n.split(" ").map(x => x[0]).join("").toUpperCase().slice(0, 2);

    const [selectedTemplate, setSelectedTemplate] = useState(TEMPLATES[0]);
    const [docTitle, setDocTitle] = useState("");
    const [workspace, setWorkspace] = useState("none");
    const [activeFilter, setActiveFilter] = useState("All Templates");
    const [creating, setCreating] = useState(false);
    const [profileOpen, setProfileOpen] = useState(false);
    const fileInputRef = useRef(null);

    // Filter templates
    const visibleTemplates = activeFilter === "All Templates"
        ? TEMPLATES
        : TEMPLATES.filter((t) => t.category === activeFilter);

    // Create document
    const handleCreate = useCallback(async () => {
        const title = docTitle.trim() || selectedTemplate.title;
        setCreating(true);
        try {
            const { data } = await api.post("/documents", {
                title,
                content: selectedTemplate.content,
            });
            navigate(`/editor/${data._id ?? data.id}`);
        } catch {
            toast.error("Failed to create document");
            setCreating(false);
        }
    }, [docTitle, selectedTemplate, navigate, toast]);

    // Import from file
    const handleImport = useCallback((e) => {
        const file = e.target.files?.[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = async (ev) => {
            const content = ev.target.result ?? "";
            const title = file.name.replace(/\.(txt|md)$/, "") || "Imported Document";
            try {
                const { data } = await api.post("/documents", { title, content });
                navigate(`/editor/${data._id ?? data.id}`);
            } catch { toast.error("Failed to import file"); }
        };
        reader.readAsText(file);
    }, [navigate, toast]);

    return (
        <div style={{ display: "flex", minHeight: "100vh", background: T.bg, fontFamily: T.font, color: T.fg }}>

            {/* Sidebar — New Document button just reloads this page */}
            <Sidebar activeTab="new" onNewDoc={() => navigate("/new")} />

            <main style={{ flex: 1, display: "flex", flexDirection: "column", minHeight: "100vh" }}>

                {/* ── Top bar ──────────────────────────────────────────────────── */}
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "20px 48px", borderBottom: `1px solid ${T.border}` }}>
                    {/* Left spacer */}
                    <div style={{ flex: 1 }} />

                    {/* Right controls */}
                    <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 8, background: T.surface, border: `1px solid ${T.border}`, borderRadius: 6, padding: "8px 12px", width: 220 }}>
                            <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={T.mutedFg} strokeWidth="2.8" strokeLinecap="round" strokeLinejoin="round"><path d="m21 21-4.34-4.34" /><circle cx="11" cy="11" r="8" /></svg>
                            <input placeholder="Search documents..." style={{ background: "none", border: "none", outline: "none", color: T.fg, fontSize: 13, fontFamily: T.font, width: "100%" }} />
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
                            <ProfileDropdown user={user} open={profileOpen} onClose={() => setProfileOpen(false)} onLogout={logout} navigate={navigate} />
                        </div>
                    </div>
                </div>

                {/* ── Main content ──────────────────────────────────────────────── */}
                <div style={{ flex: 1, padding: "40px 48px", overflowY: "auto" }}>

                    {/* Header */}
                    <div style={{ marginBottom: 32 }}>
                        <p style={{ fontSize: 11, fontWeight: 600, color: T.primary, textTransform: "uppercase", letterSpacing: "0.12em", marginBottom: 8 }}>
                            NEW DOCUMENT
                        </p>
                        <h1 style={{ fontSize: 32, fontWeight: 700, color: T.fg, letterSpacing: "-.03em", marginBottom: 6, fontFamily: T.font }}>
                            Choose a Template
                        </h1>
                        <p style={{ fontSize: 13, color: T.mutedFg }}>
                            Start from a blank page or pick a template to get going faster.
                        </p>
                    </div>

                    {/* Title + Workspace row */}
                    <div style={{ display: "flex", gap: 12, marginBottom: 32 }}>
                        {/* Title input */}
                        <div style={{ flex: 1, display: "flex", alignItems: "center", gap: 10, background: T.surface, border: `1px solid ${T.border}`, borderRadius: 7, padding: "10px 14px" }}>
                            <svg xmlns="http://www.w3.org/2000/svg" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke={T.mutedFg} strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><path d="M6 22a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h8a2.4 2.4 0 0 1 1.704.706l3.588 3.588A2.4 2.4 0 0 1 20 8v12a2 2 0 0 1-2 2z" /><path d="M14 2v5a1 1 0 0 0 1 1h5" /></svg>
                            <input
                                value={docTitle}
                                onChange={(e) => setDocTitle(e.target.value)}
                                placeholder="Document title..."
                                style={{ background: "none", border: "none", outline: "none", color: T.fg, fontSize: 14, fontFamily: T.font, width: "100%" }}
                            />
                        </div>

                        {/* Workspace dropdown */}
                        <div style={{ position: "relative" }}>
                            <select
                                value={workspace}
                                onChange={(e) => setWorkspace(e.target.value)}
                                style={{
                                    appearance: "none", background: T.surface, border: `1px solid ${T.border}`,
                                    borderRadius: 7, padding: "10px 36px 10px 14px", color: T.mutedFg,
                                    fontSize: 14, fontFamily: T.font, cursor: "pointer", outline: "none",
                                    minWidth: 180, transition: "border-color .15s",
                                }}
                                onFocus={(e) => e.target.style.borderColor = T.primary}
                                onBlur={(e) => e.target.style.borderColor = T.border}
                            >
                                {WORKSPACES.map((w) => <option key={w.id} value={w.id}>{w.label}</option>)}
                            </select>
                            <svg style={{ position: "absolute", right: 12, top: "50%", transform: "translateY(-50%)", pointerEvents: "none" }} xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={T.mutedFg} strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round"><path d="m6 9 6 6 6-6" /></svg>
                        </div>
                    </div>

                    {/* Category filter pills */}
                    <div style={{ display: "flex", gap: 8, marginBottom: 28, flexWrap: "wrap" }}>
                        {FILTERS.map((f) => {
                            const active = activeFilter === f;
                            return (
                                <button key={f} onClick={() => setActiveFilter(f)}
                                    style={{
                                        padding: "7px 16px", borderRadius: 7, fontSize: 13, fontWeight: 500,
                                        background: active ? T.primary : T.surface,
                                        color: active ? T.primFg : T.mutedFg,
                                        border: `1px solid ${active ? T.primary : T.border}`,
                                        cursor: "pointer", fontFamily: T.font, transition: "all .15s",
                                    }}
                                    onMouseEnter={(e) => { if (!active) { e.currentTarget.style.borderColor = "#3a3a3a"; e.currentTarget.style.color = T.fg; } }}
                                    onMouseLeave={(e) => { if (!active) { e.currentTarget.style.borderColor = T.border; e.currentTarget.style.color = T.mutedFg; } }}
                                >
                                    {f}
                                </button>
                            );
                        })}
                    </div>

                    {/* Template grid */}
                    <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 16, marginBottom: 32 }}>
                        {visibleTemplates.map((tmpl) => (
                            <TemplateCard
                                key={tmpl.id}
                                template={tmpl}
                                selected={selectedTemplate.id === tmpl.id}
                                onClick={() => {
                                    setSelectedTemplate(tmpl);
                                    if (!docTitle) setDocTitle(tmpl.isBlank ? "" : tmpl.title);
                                }}
                            />
                        ))}
                    </div>
                </div>

                {/* ── Bottom action bar ─────────────────────────────────────────── */}
                <div style={{
                    display: "flex", alignItems: "center", justifyContent: "space-between",
                    padding: "16px 48px", borderTop: `1px solid ${T.border}`,
                    background: T.bg, flexShrink: 0,
                }}>
                    {/* Import from file */}
                    <button
                        onClick={() => fileInputRef.current?.click()}
                        style={{ display: "flex", alignItems: "center", gap: 8, background: "none", border: "none", color: T.mutedFg, fontSize: 13, cursor: "pointer", fontFamily: T.font, transition: "color .15s" }}
                        onMouseEnter={(e) => e.currentTarget.style.color = T.fg}
                        onMouseLeave={(e) => e.currentTarget.style.color = T.mutedFg}
                    >
                        <svg xmlns="http://www.w3.org/2000/svg" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
                            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                            <polyline points="17 8 12 3 7 8" />
                            <line x1="12" x2="12" y1="3" y2="15" />
                        </svg>
                        Import from file
                    </button>
                    <input ref={fileInputRef} type="file" accept=".txt,.md" style={{ display: "none" }} onChange={handleImport} />

                    {/* Right buttons */}
                    <div style={{ display: "flex", gap: 10 }}>
                        <button
                            onClick={() => navigate(-1)}
                            style={{ padding: "9px 20px", background: "none", border: `1px solid ${T.border}`, color: T.mutedFg, borderRadius: 7, fontSize: 13, fontWeight: 500, cursor: "pointer", fontFamily: T.font, transition: "all .15s" }}
                            onMouseEnter={(e) => { e.currentTarget.style.background = T.muted; e.currentTarget.style.color = T.fg; }}
                            onMouseLeave={(e) => { e.currentTarget.style.background = "none"; e.currentTarget.style.color = T.mutedFg; }}
                        >
                            Cancel
                        </button>
                        <button
                            onClick={handleCreate}
                            disabled={creating}
                            style={{ padding: "9px 24px", background: T.primary, border: "none", color: T.primFg, borderRadius: 7, fontSize: 13, fontWeight: 600, cursor: "pointer", fontFamily: T.font, transition: "opacity .15s", display: "flex", alignItems: "center", gap: 8, opacity: creating ? .7 : 1 }}
                            onMouseEnter={(e) => { if (!creating) e.currentTarget.style.opacity = ".88"; }}
                            onMouseLeave={(e) => { if (!creating) e.currentTarget.style.opacity = "1"; }}
                        >
                            {creating ? (
                                <><svg style={{ animation: "spin .8s linear infinite", width: 14, height: 14 }} viewBox="0 0 24 24" fill="none"><circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" style={{ opacity: .25 }} /><path fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" style={{ opacity: .75 }} /></svg>Creating…</>
                            ) : "Create Document"}
                        </button>
                    </div>
                </div>
            </main>

            <style>{`
        @keyframes spin { to { transform:rotate(360deg); } }
        input::placeholder { color:${T.mutedFg}; }
        select option { background:${T.surface}; color:${T.fg}; }
      `}</style>
        </div>
    );
}