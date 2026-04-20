/**
 * pages/DocumentDashboard.jsx
 * Converted from Google Stitch HTML → production React component.
 * Fixed: doc.lines crash, owner object rendering, infinite loop, array guards.
 */

import { useState, useEffect, useMemo, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { useDocument } from "../hooks/useDocument";
import { useToast }    from "../components/UI/Toast";

// ─── Mock data (fallback when API is not yet running) ─────────────────────────
const MOCK_RECENT = [
  { _id: "r1", title: "Q3 Market Strategy",    updatedAt: new Date(), owner: { name: "You" } },
  { _id: "r2", title: "Brand Guidelines 2024", updatedAt: new Date(), owner: { name: "You" } },
  { _id: "r3", title: "Manifesto Draft",       updatedAt: new Date(), owner: { name: "You" } },
  { _id: "r4", title: "System Architecture",   updatedAt: new Date(), owner: { name: "You" } },
  { _id: "r5", title: "UX Audit Report",       updatedAt: new Date(), owner: { name: "You" } },
];

const MOCK_DOCS = [
  { _id: "d1", title: "Annual Stakeholder Deck", icon: "description", owner: { name: "You"         }, updatedAt: new Date(), collaborators: 2,  status: "Active"   },
  { _id: "d2", title: "Project Chimera Phase 2", icon: "article",     owner: { name: "Marcus Reed" }, updatedAt: new Date(), collaborators: 1,  status: "Active"   },
  { _id: "d3", title: "Legacy Archive V1",        icon: "history_edu", owner: { name: "System Admin"}, updatedAt: new Date(), collaborators: 0,  status: "Archived" },
  { _id: "d4", title: "Internal Policy 2.4",      icon: "feed",        owner: { name: "Elena Moss"  }, updatedAt: new Date(), collaborators: 12, status: "Active"   },
  { _id: "d5", title: "Product Roadmap H2",       icon: "map",         owner: { name: "You"         }, updatedAt: new Date(), collaborators: 3,  status: "Active"   },
  { _id: "d6", title: "Competitor Analysis",      icon: "analytics",   owner: { name: "Alice Logan" }, updatedAt: new Date(), collaborators: 2,  status: "Archived" },
];

const ITEMS_PER_PAGE = 4;

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Safely get owner display name from populated object or plain string */
function ownerName(owner) {
  if (!owner) return "Unknown";
  if (typeof owner === "object") return owner.name ?? owner.email ?? "Unknown";
  return owner;
}

/** Safely get owner initials */
function ownerInitials(owner) {
  const name = ownerName(owner);
  return name.split(" ").map((n) => n[0]).join("").toUpperCase().slice(0, 2);
}

/** Get doc ID regardless of _id or id field */
function docId(doc) {
  return doc._id ?? doc.id ?? "";
}

/** Format date nicely */
function fmtDate(d) {
  if (!d) return "—";
  return new Date(d).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}

// ─── Avatar stack ─────────────────────────────────────────────────────────────
function AvatarStack({ count }) {
  if (!count || count === 0) {
    return <span className="text-[10px] text-on-surface-variant italic">No collaborators</span>;
  }
  if (count > 9) {
    return (
      <div className="flex -space-x-2">
        <div className="w-6 h-6 rounded-full border-2 border-surface-container-lowest bg-primary/10 flex items-center justify-center text-[10px] font-bold">
          +{count}
        </div>
      </div>
    );
  }
  return (
    <div className="flex -space-x-2">
      {Array.from({ length: Math.min(count, 3) }).map((_, i) => (
        <div
          key={i}
          className="w-6 h-6 rounded-full border-2 border-surface-container-lowest bg-primary-container flex items-center justify-center text-[8px] font-bold text-on-primary-container"
        >
          {String.fromCharCode(65 + i)}
        </div>
      ))}
      {count > 3 && (
        <div className="w-6 h-6 rounded-full border-2 border-surface-container-lowest bg-surface-container-high flex items-center justify-center text-[8px] font-bold text-on-surface-variant">
          +{count - 3}
        </div>
      )}
    </div>
  );
}

// ─── Status badge ─────────────────────────────────────────────────────────────
function StatusBadge({ status }) {
  const isActive = status === "Active";
  return (
    <span className={`inline-flex items-center px-2 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider ${
      isActive ? "bg-tertiary/10 text-tertiary" : "bg-on-surface-variant/10 text-on-surface-variant"
    }`}>
      {status ?? "—"}
    </span>
  );
}

// ─── Recent doc card ──────────────────────────────────────────────────────────
function RecentCard({ doc, onClick }) {
  // Generate visual preview lines — no dependency on doc.lines
  const lines = [100, 75, 100, 60, 83].slice(0, 3 + (docId(doc).charCodeAt(0) % 3));

  return (
    <div className="flex-none w-[200px] group cursor-pointer" onClick={() => onClick(doc)}>
      <div className="h-[160px] w-full bg-surface-container-lowest rounded-xl p-4 shadow-[0_4px_20px_rgba(25,49,93,0.04)] border border-outline-variant/10 group-hover:shadow-[0_20px_50px_rgba(25,49,93,0.06)] group-hover:-translate-y-1 transition-all duration-300 flex flex-col gap-2 overflow-hidden">
        <div className="space-y-2 opacity-20">
          {lines.map((w, i) => (
            <div key={i} className="h-2 bg-slate-400 rounded-full" style={{ width: `${w}%` }} />
          ))}
        </div>
      </div>
      <div className="mt-3">
        <h3 className="font-bold text-sm text-on-surface truncate">
          {doc.title ?? "Untitled Document"}
        </h3>
        <div className="flex justify-between items-center mt-1">
          <span className="text-[10px] text-on-surface-variant uppercase tracking-wider font-medium">
            {fmtDate(doc.updatedAt)}
          </span>
          <div className="w-5 h-5 rounded-full border-2 border-surface bg-primary-container flex items-center justify-center text-[8px] font-bold text-on-primary-container">
            {ownerInitials(doc.owner)}
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Filter tab group ─────────────────────────────────────────────────────────
const FILTERS = ["All", "Owned by me", "Shared with me"];

function FilterTabs({ active, onChange }) {
  return (
    <div className="flex bg-surface-container-low p-1 rounded-lg self-start">
      {FILTERS.map((f) => (
        <button
          key={f}
          onClick={() => onChange(f)}
          className={`px-4 py-1.5 text-xs font-bold rounded-md transition-all ${
            active === f
              ? "bg-white text-on-surface shadow-sm"
              : "text-on-surface-variant hover:text-on-surface"
          }`}
        >
          {f}
        </button>
      ))}
    </div>
  );
}

// ─── Navbar ───────────────────────────────────────────────────────────────────
function Navbar({ search, onSearchChange }) {
  return (
    <header className="bg-slate-50/80 backdrop-blur-md fixed top-0 w-full z-50 shadow-[0_20px_50px_rgba(25,49,93,0.06)] flex justify-between items-center px-8 h-16">
      <div className="flex items-center gap-8">
        <span className="text-xl font-headline font-bold tracking-tight text-slate-900">
          CollabDocs
        </span>
        <nav className="hidden md:flex gap-6">
          {["Dashboard", "Templates", "Shared", "Archive"].map((item, i) => (
            <a
              key={item}
              href="#"
              className={`font-medium transition-colors ${
                i === 0
                  ? "text-slate-900 font-bold border-b-2 border-slate-900 pb-1"
                  : "text-slate-500 hover:text-slate-900"
              }`}
            >
              {item}
            </a>
          ))}
        </nav>
      </div>

      {/* Search */}
      <div className="flex-1 flex justify-center px-4">
        <div className="relative w-full max-w-[400px]">
          <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-on-surface-variant text-sm">
            search
          </span>
          <input
            type="text"
            value={search}
            onChange={(e) => onSearchChange(e.target.value)}
            placeholder="Search documents..."
            className="w-full bg-surface-container-low border-none rounded-xl py-2 pl-10 pr-4 text-sm focus:ring-2 focus:ring-primary/20 placeholder:text-on-surface-variant/60 outline-none"
          />
        </div>
      </div>

      {/* Right */}
      <div className="flex items-center gap-4">
        <button className="text-slate-700 hover:text-slate-900 transition-colors">
          <span className="material-symbols-outlined">notifications</span>
        </button>
        <button className="text-slate-700 hover:text-slate-900 transition-colors">
          <span className="material-symbols-outlined">settings</span>
        </button>
        <div className="flex items-center gap-2 pl-4 border-l border-outline-variant/20">
          <div className="w-8 h-8 rounded-full bg-primary-container flex items-center justify-center text-xs font-bold text-on-primary-container">
            ME
          </div>
          <span className="text-sm font-semibold text-on-surface hidden sm:inline">My Account</span>
          <span className="material-symbols-outlined text-sm text-on-surface-variant">expand_more</span>
        </div>
      </div>
    </header>
  );
}

// ─── ROOT: DocumentDashboard ──────────────────────────────────────────────────
export default function DocumentDashboard() {
  const navigate = useNavigate();
  const { toast } = useToast();
  const { loading, loadDocuments, createDoc } = useDocument();

  const [search,     setSearch]     = useState("");
  const [filter,     setFilter]     = useState("All");
  const [page,       setPage]       = useState(1);
  const [allDocs,    setAllDocs]    = useState(MOCK_DOCS);
  const [recentDocs, setRecentDocs] = useState(MOCK_RECENT);

  // ── Load documents from API once on mount ─────────────────────────────────
  useEffect(() => {
    loadDocuments()
      .then((data) => {
        if (Array.isArray(data?.documents) && data.documents.length > 0) {
          setAllDocs(data.documents);
          setRecentDocs(data.documents.slice(0, 5));
        }
      })
      .catch(() => {
        // API unreachable — mock data stays visible
      });
  }, []); // intentionally empty — run once only

  // ── Filter + search ───────────────────────────────────────────────────────
  const filteredDocs = useMemo(() => {
    let docs = Array.isArray(allDocs) ? allDocs : [];

    if (filter === "Owned by me") {
      docs = docs.filter((d) => {
        const name = ownerName(d.owner).toLowerCase();
        return name === "you" || name === "me";
      });
    }
    if (filter === "Shared with me") {
      docs = docs.filter((d) => {
        const name = ownerName(d.owner).toLowerCase();
        return name !== "you" && name !== "me";
      });
    }
    if (search.trim()) {
      const q = search.toLowerCase();
      docs = docs.filter((d) => (d.title ?? "").toLowerCase().includes(q));
    }

    return docs;
  }, [allDocs, filter, search]);

  const totalPages = Math.max(1, Math.ceil(filteredDocs.length / ITEMS_PER_PAGE));
  const pagedDocs  = filteredDocs.slice((page - 1) * ITEMS_PER_PAGE, page * ITEMS_PER_PAGE);

  // Reset to page 1 when filter or search changes
  useEffect(() => setPage(1), [filter, search]);

  // ── Handlers ──────────────────────────────────────────────────────────────
  const handleOpenDoc = useCallback((doc) => {
    navigate(`/editor/${docId(doc)}`);
  }, [navigate]);

  const handleNewDoc = useCallback(async () => {
    try {
      const doc = await createDoc("Untitled Document");
      if (doc) navigate(`/editor/${docId(doc)}`);
      else toast.error("Failed to create document");
    } catch {
      toast.error("Failed to create document");
    }
  }, [createDoc, navigate, toast]);

  return (
    <div className="bg-surface text-on-surface min-h-screen">
      <Navbar search={search} onSearchChange={setSearch} />

      <main className="pt-24 pb-20 px-8 max-w-7xl mx-auto">

        {/* ── Recent Documents ─────────────────────────────────────────────── */}
        <section className="mb-12">
          <div className="flex justify-between items-end mb-6">
            <div>
              <h2 className="text-2xl font-headline font-extrabold tracking-tight text-on-surface">
                Recent Documents
              </h2>
              <p className="text-on-surface-variant text-sm">Continue where you left off</p>
            </div>
            <button className="text-primary font-semibold text-sm hover:underline">
              View all
            </button>
          </div>

          <div className="flex gap-6 overflow-x-auto pb-4 scrollbar-hide">
            {(Array.isArray(recentDocs) ? recentDocs : []).map((doc) => (
              <RecentCard key={docId(doc)} doc={doc} onClick={handleOpenDoc} />
            ))}
          </div>
        </section>

        {/* ── All Documents ─────────────────────────────────────────────────── */}
        <section>
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-8">
            <h2 className="text-2xl font-headline font-extrabold tracking-tight text-on-surface">
              All Documents
            </h2>
            <FilterTabs active={filter} onChange={setFilter} />
          </div>

          <div className="bg-surface-container-lowest rounded-2xl shadow-[0_20px_50px_rgba(25,49,93,0.04)] overflow-hidden">
            {loading ? (
              <div className="flex items-center justify-center py-16">
                <svg className="animate-spin h-6 w-6 text-on-surface-variant" viewBox="0 0 24 24" fill="none">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/>
                </svg>
              </div>
            ) : (
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-surface-container-low/50">
                    {["Title", "Owner", "Last Modified", "Collaborators", "Status"].map((h) => (
                      <th key={h} className="px-6 py-4 text-[10px] uppercase tracking-widest font-bold text-on-surface-variant">
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-outline-variant/10">
                  {pagedDocs.length === 0 ? (
                    <tr>
                      <td colSpan={5} className="px-6 py-12 text-center text-sm text-on-surface-variant">
                        No documents found.
                      </td>
                    </tr>
                  ) : (
                    pagedDocs.map((doc) => (
                      <tr
                        key={docId(doc)}
                        className="hover:bg-surface-container-low/30 transition-colors group cursor-pointer"
                        onClick={() => handleOpenDoc(doc)}
                      >
                        {/* Title */}
                        <td className="px-6 py-5">
                          <div className="flex items-center gap-3">
                            <span className="material-symbols-outlined text-primary text-xl">
                              {doc.icon ?? "description"}
                            </span>
                            <span className="font-semibold text-sm text-on-surface group-hover:text-primary transition-colors">
                              {doc.title ?? "Untitled Document"}
                            </span>
                          </div>
                        </td>

                        {/* Owner */}
                        <td className="px-6 py-5">
                          <div className="flex items-center gap-2">
                            <div className="w-6 h-6 rounded-full bg-primary-container flex items-center justify-center text-[10px] font-bold text-on-primary-container">
                              {ownerInitials(doc.owner)}
                            </div>
                            <span className="text-sm text-on-surface-variant">
                              {ownerName(doc.owner)}
                            </span>
                          </div>
                        </td>

                        {/* Last modified */}
                        <td className="px-6 py-5">
                          <span className="text-sm text-on-surface-variant">
                            {fmtDate(doc.updatedAt)}
                          </span>
                        </td>

                        {/* Collaborators */}
                        <td className="px-6 py-5">
                          <AvatarStack
                            count={
                              Array.isArray(doc.collaborators)
                                ? doc.collaborators.length
                                : (typeof doc.collaborators === "number" ? doc.collaborators : 0)
                            }
                          />
                        </td>

                        {/* Status */}
                        <td className="px-6 py-5">
                          <StatusBadge status={doc.status ?? "Active"} />
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            )}

            {/* Pagination */}
            <div className="px-6 py-4 bg-surface-container-low/20 flex justify-between items-center">
              <span className="text-xs text-on-surface-variant">
                {filteredDocs.length === 0
                  ? "No documents"
                  : `Showing ${(page - 1) * ITEMS_PER_PAGE + 1}–${Math.min(page * ITEMS_PER_PAGE, filteredDocs.length)} of ${filteredDocs.length}`
                }
              </span>
              <div className="flex gap-2">
                <button
                  disabled={page === 1}
                  onClick={() => setPage((p) => p - 1)}
                  className="p-1.5 rounded hover:bg-surface-container-high transition-colors disabled:opacity-30"
                >
                  <span className="material-symbols-outlined text-sm">chevron_left</span>
                </button>
                <button
                  disabled={page === totalPages}
                  onClick={() => setPage((p) => p + 1)}
                  className="p-1.5 rounded hover:bg-surface-container-high transition-colors disabled:opacity-30"
                >
                  <span className="material-symbols-outlined text-sm">chevron_right</span>
                </button>
              </div>
            </div>
          </div>
        </section>
      </main>

      {/* FAB — New Document */}
      <button
        onClick={handleNewDoc}
        className="fixed bottom-8 right-8 w-16 h-16 bg-primary text-on-primary rounded-full shadow-[0_20px_50px_rgba(86,94,116,0.3)] hover:shadow-[0_25px_60px_rgba(86,94,116,0.4)] hover:scale-105 active:scale-95 transition-all duration-300 flex items-center justify-center z-[100]"
        title="New Document"
      >
        <span className="material-symbols-outlined text-3xl" style={{ fontVariationSettings: "'wght' 500" }}>
          add
        </span>
      </button>
    </div>
  );
}
