/**
 * VersionHistoryPanel.jsx
 * Converted from Google Stitch HTML → production React component.
 *
 * Props:
 *   isOpen     {boolean}  — controls panel visibility
 *   onClose    {fn}       — called when X is clicked
 *   docId      {string}   — document ID to fetch history for
 *   onRestore  {fn}       — called with (version) when user restores
 *
 * API wired to: GET /api/documents/:docId/history
 */

import { useState, useEffect } from "react";
import api from "../../services/api";

// ─── Mock data (replace with real API call) ───────────────────────────────────
const MOCK_HISTORY = [
  {
    id: "v6",
    timestamp: "Today at 3:42 PM",
    author: { initials: "JD", name: "John Doe",   bg: "bg-primary-fixed-dim" },
    description: "Refined typography hierarchy and added editorial imagery.",
    isCurrent: true,
    snapshotId: "VERSION_SNAP_772",
  },
  {
    id: "v5",
    timestamp: "Today at 1:15 PM",
    author: { initials: "AL", name: "Alice Logan", bg: "bg-tertiary-fixed-dim" },
    description: "Integrated real-time collaboration status indicators.",
    isCurrent: false,
  },
  {
    id: "v4",
    timestamp: "Yesterday at 11:04 AM",
    author: { initials: "MK", name: "Marcus King", bg: "bg-secondary-fixed-dim" },
    description: "Initial structure of the tonal layering system.",
    isCurrent: false,
  },
  {
    id: "v3",
    timestamp: "Oct 24 at 4:20 PM",
    author: { initials: "JD", name: "John Doe",   bg: "bg-primary-container" },
    description: "Drafted content for the main workspace philosophy section.",
    isCurrent: false,
  },
  {
    id: "v2",
    timestamp: "Oct 23 at 9:12 AM",
    author: { initials: "S",  name: "System",      bg: "bg-white" },
    description: "Automated snapshot: Plugin updates and assets optimization.",
    isCurrent: false,
  },
  {
    id: "v1",
    timestamp: "Oct 20 at 2:00 PM",
    author: { initials: "AL", name: "Alice Logan", bg: "bg-slate-500" },
    description: "Creation of the master document and core metadata setup.",
    isCurrent: false,
  },
];

// ─── Single timeline entry ─────────────────────────────────────────────────────
function TimelineEntry({ version, isLast, onRestore, isSelected, onSelect }) {
  const [hovered, setHovered] = useState(false);

  return (
    <div
      className={`relative group p-4 rounded-md transition-all duration-300 cursor-pointer
        ${version.isCurrent
          ? "border-l-4 border-slate-900 bg-slate-800 text-white"
          : "hover:bg-slate-800/50"
        }
        ${isSelected && !version.isCurrent ? "bg-slate-800/70 ring-1 ring-slate-600" : ""}
      `}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      onClick={() => onSelect(version)}
    >
      {/* Vertical connector line */}
      {!isLast && (
        <div className="absolute left-[-16px] top-0 bottom-[-4px] w-[2px] bg-slate-700 z-0" />
      )}
      {isLast && (
        <div className="absolute left-[-16px] top-0 h-10 w-[2px] bg-slate-700 z-0" />
      )}

      {/* Timeline dot */}
      <div
        className={`absolute left-[-21px] top-4 w-3 h-3 rounded-full ring-4 ring-slate-900 z-10 transition-colors
          ${version.isCurrent ? "bg-secondary" : hovered ? "bg-primary-fixed-dim" : "bg-slate-600"}
        `}
      />

      {/* Header row */}
      <div className="flex justify-between items-start mb-2">
        <span
          className={`text-[11px] font-semibold
            ${version.isCurrent ? "text-secondary-fixed" : "text-slate-400"}
          `}
        >
          {version.timestamp}
        </span>

        {version.isCurrent ? (
          <span className="px-2 py-0.5 bg-secondary/20 text-secondary-fixed text-[9px] font-bold rounded uppercase tracking-tighter">
            Current version
          </span>
        ) : (
          <button
            className={`text-[10px] font-bold text-secondary-fixed hover:underline transition-opacity
              ${hovered ? "opacity-100" : "opacity-0"}
            `}
            onClick={(e) => { e.stopPropagation(); onRestore(version); }}
          >
            Restore this version
          </button>
        )}
      </div>

      {/* Author */}
      <div className="flex items-center gap-3 mb-2">
        <div
          className={`w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-bold text-slate-900 ${version.author.bg}`}
        >
          {version.author.initials}
        </div>
        <span className={`font-semibold ${version.isCurrent ? "text-white" : "text-slate-200"}`}>
          {version.author.name}
        </span>
      </div>

      {/* Description */}
      <p className={`text-xs leading-relaxed ${version.isCurrent ? "text-slate-300" : "text-slate-400"}`}>
        {version.description}
      </p>
    </div>
  );
}

// ─── Main Panel ───────────────────────────────────────────────────────────────
export default function VersionHistoryPanel({ isOpen, onClose, docId, onRestore }) {
  const [history, setHistory]         = useState(MOCK_HISTORY);
  const [loading, setLoading]         = useState(false);
  const [selectedVersion, setSelected]= useState(null);
  const [restoring, setRestoring]     = useState(false);

  // Fetch real history when panel opens
  useEffect(() => {
    if (!isOpen || !docId) return;
    setLoading(true);
    api.get(`/history/${docId}`)
      .then(({ data }) => { if (data.history?.length) setHistory(data.history); })
      .catch(() => { /* keep mock data on error */ })
      .finally(() => setLoading(false));
  }, [isOpen, docId]);

  const handleRestore = async (version) => {
    if (!version) return;
    setRestoring(true);
    try {
      await api.post(`/documents/${docId}/restore`, { versionId: version.id });
      await new Promise((r) => setTimeout(r, 800)); // mock
      onRestore?.(version);
      onClose();
    } finally {
      setRestoring(false);
    }
  };

  // Slide-in panel — rendered in DOM at all times, transformed off-screen when closed
  return (
    <>
      {/* Backdrop */}
      <div
        className={`fixed inset-0 bg-black/20 backdrop-blur-[2px] z-40 transition-opacity duration-300
          ${isOpen ? "opacity-100 pointer-events-auto" : "opacity-0 pointer-events-none"}
        `}
        onClick={onClose}
      />

      {/* Panel */}
      <aside
        className={`
          h-screen w-80 fixed right-0 top-0 bg-slate-900 text-white text-sm
          flex flex-col shadow-[-10px_0_30px_rgba(0,0,0,0.1)] z-50
          transition-transform duration-300 ease-in-out
          ${isOpen ? "translate-x-0" : "translate-x-full"}
        `}
      >
        {/* Header */}
        <div className="p-6 flex items-center justify-between flex-shrink-0">
          <div>
            <h2 className="text-lg font-headline font-bold text-white tracking-tight">
              Version History
            </h2>
            <p className="text-slate-400 text-[10px] uppercase tracking-widest mt-1">
              v2.4.0 · Active
            </p>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-slate-800 transition-colors"
          >
            <span className="material-symbols-outlined text-slate-400 text-sm">close</span>
          </button>
        </div>

        {/* Timeline */}
        <div className="flex-1 overflow-y-auto px-4 py-2 space-y-1 scrollbar-thin scrollbar-thumb-slate-700">
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <svg className="animate-spin h-6 w-6 text-slate-500" viewBox="0 0 24 24" fill="none">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/>
              </svg>
            </div>
          ) : (
            history.map((version, idx) => (
              <TimelineEntry
                key={version.id}
                version={version}
                isLast={idx === history.length - 1}
                isSelected={selectedVersion?.id === version.id}
                onSelect={setSelected}
                onRestore={handleRestore}
              />
            ))
          )}
        </div>

        {/* Footer */}
        <div className="p-4 bg-black/50 backdrop-blur-sm border-t border-slate-800/50 flex-shrink-0">
          <button
            onClick={() => handleRestore(selectedVersion)}
            disabled={!selectedVersion || selectedVersion.isCurrent || restoring}
            className="
              w-full py-3 bg-slate-800 hover:bg-slate-700 text-white font-semibold
              rounded-md transition-all flex items-center justify-center gap-2
              disabled:opacity-40 disabled:cursor-not-allowed
            "
          >
            {restoring ? (
              <>
                <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24" fill="none">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/>
                </svg>
                Restoring…
              </>
            ) : (
              <>
                <span className="material-symbols-outlined text-sm">restore_page</span>
                {selectedVersion && !selectedVersion.isCurrent
                  ? `Restore ${selectedVersion.timestamp}`
                  : "Select a version to restore"}
              </>
            )}
          </button>

          <div className="flex justify-between items-center mt-4 px-2">
            <button className="flex items-center gap-2 text-slate-400 hover:text-white transition-colors text-xs">
              <span className="material-symbols-outlined text-sm">help</span>
              Support
            </button>
            <span className="text-[10px] text-slate-600 font-mono">
              {selectedVersion?.snapshotId ?? "ID: —"}
            </span>
          </div>
        </div>
      </aside>
    </>
  );
}
