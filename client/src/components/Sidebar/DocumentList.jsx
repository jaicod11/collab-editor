/**
 * components/Sidebar/DocumentList.jsx
 * ─────────────────────────────────────────────────────────────────────────────
 * Left sidebar shown inside EditorPage.
 * Lists the user's recent documents and lets them switch or create new ones.
 *
 * Props:
 *   activeDocId   {string}   — currently open document ID
 *   onSelect      {fn}       — called with docId when user clicks a doc
 *   onNewDoc      {fn}       — called when "+ New Document" is clicked
 *   collapsed     {bool}     — if true, render icon-only rail
 */

import { useEffect } from "react";
import { useDocument } from "../../hooks/useDocument";

function DocItem({ doc, isActive, onClick }) {
  const initials = doc.title?.slice(0, 2).toUpperCase() ?? "UN";

  return (
    <button
      onClick={() => onClick(doc.id)}
      className={`
        w-full text-left flex items-center gap-3 px-3 py-2.5 rounded-xl
        transition-all group
        ${isActive
          ? "bg-primary-container text-on-primary-container"
          : "text-slate-300 hover:bg-slate-800 hover:text-white"
        }
      `}
    >
      {/* Doc icon */}
      <span
        className={`
          w-8 h-8 rounded-lg flex-shrink-0 flex items-center justify-center
          text-[10px] font-bold
          ${isActive ? "bg-primary text-on-primary" : "bg-slate-700 text-slate-300"}
        `}
      >
        {initials}
      </span>

      {/* Title + meta */}
      <div className="flex-1 min-w-0">
        <p className={`text-sm font-semibold truncate ${isActive ? "text-on-primary-container" : ""}`}>
          {doc.title ?? "Untitled Document"}
        </p>
        <p className="text-[10px] text-slate-500 truncate mt-0.5">
          {doc.updatedAt
            ? new Date(doc.updatedAt).toLocaleDateString(undefined, { month: "short", day: "numeric" })
            : "—"}
        </p>
      </div>

      {/* Active indicator dot */}
      {isActive && (
        <span className="w-1.5 h-1.5 rounded-full bg-primary flex-shrink-0" />
      )}
    </button>
  );
}

export default function DocumentList({ activeDocId, onSelect, onNewDoc, collapsed = false }) {
  const { documents, loading, loadDocuments } = useDocument();

  useEffect(() => {
    loadDocuments();
  }, [loadDocuments]);

  if (collapsed) {
    return (
      <div className="flex flex-col items-center gap-2 py-4">
        <button
          onClick={onNewDoc}
          className="w-10 h-10 rounded-xl bg-primary text-on-primary flex items-center justify-center hover:opacity-90 transition"
          title="New Document"
        >
          <span className="material-symbols-outlined text-sm">add</span>
        </button>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full bg-slate-900 w-64 flex-shrink-0">
      {/* Header */}
      <div className="px-4 pt-5 pb-3 flex items-center justify-between">
        <h2 className="text-xs font-bold uppercase tracking-widest text-slate-500">
          Documents
        </h2>
        <button
          onClick={onNewDoc}
          className="w-7 h-7 rounded-lg bg-primary text-on-primary flex items-center justify-center hover:opacity-90 transition"
          title="New Document"
        >
          <span className="material-symbols-outlined" style={{ fontSize: 16 }}>add</span>
        </button>
      </div>

      {/* Doc list */}
      <div className="flex-1 overflow-y-auto px-2 pb-4 scrollbar-thin">
        {loading ? (
          <div className="flex items-center justify-center py-8">
            <svg className="animate-spin h-5 w-5 text-slate-600" viewBox="0 0 24 24" fill="none">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/>
            </svg>
          </div>
        ) : documents.length === 0 ? (
          <div className="text-center py-10 px-4">
            <span className="material-symbols-outlined text-slate-700 text-3xl block mb-2">
              description
            </span>
            <p className="text-xs text-slate-600">No documents yet</p>
          </div>
        ) : (
          <div className="space-y-0.5">
            {documents.map((doc) => (
              <DocItem
                key={doc.id ?? doc._id}
                doc={{ ...doc, id: doc.id ?? doc._id }}
                isActive={(doc.id ?? doc._id) === activeDocId}
                onClick={onSelect}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
