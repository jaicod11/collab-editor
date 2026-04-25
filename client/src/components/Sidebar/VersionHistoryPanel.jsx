/**
 * components/Sidebar/VersionHistoryPanel.jsx — New UI (Stitch v2)
 * Dark glass drawer from the right. Animated gradient background,
 * glowing cyan timeline dot on current version, staggered entry
 * animations, hover restore button, footer with restore CTA.
 */

import { useState, useEffect } from "react";
import api from "../../services/api";

const ANIM_STYLES = `
  @keyframes gradientShift {
    0%   { background-position:0% 50%;   }
    50%  { background-position:100% 50%; }
    100% { background-position:0% 50%;   }
  }
  @keyframes slideInRight {
    from { transform:translateX(100%); opacity:0; }
    to   { transform:translateX(0);    opacity:1; }
  }
  @keyframes fadeUp {
    from { opacity:0; transform:translateY(10px); }
    to   { opacity:1; transform:translateY(0);    }
  }
  .panel-enter  { animation:slideInRight .3s ease-out both; }
  .entry-anim   { animation:fadeUp .3s ease both; }
  .grad-shift {
    background-size:200% 200%;
    animation:gradientShift 8s ease infinite;
  }
  .scrollbar-custom::-webkit-scrollbar { width:4px; }
  .scrollbar-custom::-webkit-scrollbar-track  { background:rgba(255,255,255,.02); }
  .scrollbar-custom::-webkit-scrollbar-thumb  { background:rgba(255,255,255,.1); border-radius:10px; }
`;

// ─── Mock history data ────────────────────────────────────────────────────────
const MOCK_HISTORY = [
  {
    id: "v4", revision: 80, isCurrent: true,
    timestamp: "Oct 24, 2023 • 14:42",
    author: { initials: "JD", name: "Julian Draxler", color: "bg-cyan-500/20 text-cyan-300" },
    description: "Finalized typography scales and updated the global color tokens for dark mode.",
    snapshotId: "04X-99B-HIST-V24",
  },
  {
    id: "v3", revision: 60, isCurrent: false,
    timestamp: "Oct 24, 2023 • 09:15",
    author: { initials: "SA", name: "Sarah Anderson", color: "bg-purple-500/20 text-purple-300" },
    description: "Refactored component structures and fixed responsive grid layout issues.",
  },
  {
    id: "v2", revision: 40, isCurrent: false,
    timestamp: "Oct 23, 2023 • 18:20",
    author: { initials: "MK", name: "Marcus Kane", color: "bg-white/10 text-white" },
    description: "Completed initial draft for hero section and background effects.",
  },
  {
    id: "v1", revision: 1, isCurrent: false,
    timestamp: "Oct 20, 2023 • 11:00",
    author: { initials: "JD", name: "Julian Draxler", color: "bg-cyan-500/20 text-cyan-300" },
    description: "Project initialization and basic document setup.",
  },
];

// ─── Single timeline entry ────────────────────────────────────────────────────
function TimelineEntry({ version, index, isSelected, onSelect, onRestore, restoring }) {
  const [hovered, setHovered] = useState(false);

  return (
    <div
      className={`entry-anim group relative pl-10 py-4 rounded-xl border-2 cursor-pointer transition-all duration-200
        ${version.isCurrent
          ? "border-[#00d4ff] bg-white/5"
          : isSelected
            ? "border-white/20 bg-white/5"
            : "border-transparent hover:bg-white/5"
        }`}
      style={{ animationDelay: `${index * 60}ms` }}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      onClick={() => onSelect(version)}
    >
      {/* Timeline dot */}
      <div
        className={`absolute left-[-11px] top-7 w-3 h-3 rounded-full z-10 transition-colors ring-4 ring-[#0d1526]
          ${version.isCurrent ? "bg-[#00d4ff]" : hovered ? "bg-white/40" : "bg-white/20"}`}
        style={version.isCurrent ? { boxShadow:"0 0 12px rgba(0,212,255,0.8)" } : {}}
      />

      <div className="flex flex-col gap-2.5">
        {/* Timestamp + badge */}
        <div className="flex justify-between items-center">
          <span className="text-xs font-medium text-white/40 tracking-wide">{version.timestamp}</span>
          {version.isCurrent ? (
            <span className="text-[10px] font-bold text-[#00d4ff] bg-[#00d4ff]/10 px-2 py-0.5 rounded-full uppercase tracking-wide">
              Current version
            </span>
          ) : (
            <button
              className={`text-[11px] font-bold text-white/60 underline uppercase tracking-tight text-left transition-opacity
                ${hovered ? "opacity-100" : "opacity-0"}`}
              onClick={(e) => { e.stopPropagation(); onRestore(version); }}
            >
              Restore this version
            </button>
          )}
        </div>

        {/* Author */}
        <div className="flex items-center gap-3">
          <div className={`w-8 h-8 rounded-full flex items-center justify-center text-[10px] font-bold ${version.author.color}`}>
            {version.author.initials}
          </div>
          <span className="text-sm font-semibold text-white/80">{version.author.name}</span>
        </div>

        {/* Description */}
        <p className="text-xs text-white/50 leading-relaxed">{version.description}</p>
      </div>
    </div>
  );
}

// ─── ROOT: VersionHistoryPanel ────────────────────────────────────────────────
export default function VersionHistoryPanel({ isOpen, onClose, docId, onRestore }) {
  const [history,  setHistory]  = useState(MOCK_HISTORY);
  const [loading,  setLoading]  = useState(false);
  const [selected, setSelected] = useState(null);
  const [restoring,setRestoring]= useState(false);

  // Fetch real history when panel opens
  useEffect(() => {
    if (!isOpen || !docId) return;
    setLoading(true);
    api.get(`/history/${docId}`)
      .then(({ data }) => {
        if (Array.isArray(data.history) && data.history.length > 0) {
          setHistory(data.history);
        }
      })
      .catch(() => { /* keep mock on error */ })
      .finally(() => setLoading(false));
  }, [isOpen, docId]);

  const handleRestore = async (version) => {
    if (!version || version.isCurrent) return;
    setRestoring(true);
    try {
      await api.post(`/documents/${docId}/restore`, { versionId: version.id });
      onRestore?.(version);
      onClose();
    } catch {
      // silently fail — server handles error
    } finally {
      setRestoring(false);
    }
  };

  const currentSnapshotId = selected?.snapshotId ?? history.find((h) => h.isCurrent)?.snapshotId ?? "—";

  return (
    <>
      {/* Backdrop */}
      <div
        className={`fixed inset-0 z-[100] transition-opacity duration-300
          ${isOpen ? "opacity-100 pointer-events-auto" : "opacity-0 pointer-events-none"}`}
        style={{ background:"rgba(0,0,0,0.4)", backdropFilter:"blur(4px)" }}
        onClick={onClose}
      />

      {/* Panel */}
      <aside
        className={`fixed right-0 top-0 h-full w-[360px] z-[110] flex flex-col border-l border-white/10
          transition-transform duration-300 ease-out
          ${isOpen ? "translate-x-0 panel-enter" : "translate-x-full"}`}
        style={{
          background:"linear-gradient(135deg,#0d1526,#111c33,#0d1526)",
          backdropFilter:"blur(20px)",
          boxShadow:"-20px 0 60px rgba(0,0,0,0.5)",
          fontFamily:"Manrope,sans-serif",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <style>{ANIM_STYLES}</style>

        {/* Header */}
        <header className="p-6 flex justify-between items-start flex-shrink-0">
          <div className="space-y-1">
            <h2 className="text-xl font-bold text-white tracking-tight">Version History</h2>
            <p className="text-[10px] font-bold text-white/30 uppercase tracking-widest">v2.4.0 · Active</p>
          </div>
          <button onClick={onClose}
            className="text-white/40 hover:text-white transition-colors p-1 hover:bg-white/10 rounded-lg">
            <span className="material-symbols-outlined text-xl">close</span>
          </button>
        </header>

        {/* Scrollable timeline */}
        <div className="flex-1 overflow-y-auto scrollbar-custom px-6 pb-6 relative">
          {/* Vertical rail */}
          <div className="absolute left-[33px] top-0 bottom-0 w-px bg-white/10" />

          {loading ? (
            <div className="flex items-center justify-center py-16">
              <svg className="animate-spin h-6 w-6 text-[#00d4ff]" viewBox="0 0 24 24" fill="none">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/>
              </svg>
            </div>
          ) : (
            <div className="space-y-3 relative">
              {history.map((version, idx) => (
                <TimelineEntry
                  key={version.id}
                  version={version}
                  index={idx}
                  isSelected={selected?.id === version.id}
                  onSelect={setSelected}
                  onRestore={handleRestore}
                  restoring={restoring}
                />
              ))}
            </div>
          )}
        </div>

        {/* Footer */}
        <footer className="p-6 border-t border-white/10 flex-shrink-0 space-y-5"
          style={{ background:"rgba(0,0,0,0.3)", backdropFilter:"blur(12px)" }}>

          <button
            disabled={!selected || selected.isCurrent || restoring}
            onClick={() => handleRestore(selected)}
            className="w-full py-4 text-sm font-bold rounded-xl transition-all active:scale-95 disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center gap-2"
            style={{ background:"#00d4ff", color:"#003642", boxShadow:"0 0 20px rgba(0,212,255,0.25)" }}
          >
            {restoring ? (
              <><svg className="animate-spin h-4 w-4" viewBox="0 0 24 24" fill="none">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/>
              </svg>Restoring…</>
            ) : selected && !selected.isCurrent
              ? `Restore ${selected.timestamp}`
              : "Restore Selected Version"
            }
          </button>

          <div className="flex flex-col items-center gap-2">
            <a href="#" className="text-[10px] text-white/30 hover:text-white transition-colors uppercase tracking-widest font-bold">
              Contact Support
            </a>
            <span className="text-[9px] text-white/20 font-mono">ID: {currentSnapshotId}</span>
          </div>
        </footer>
      </aside>
    </>
  );
}
