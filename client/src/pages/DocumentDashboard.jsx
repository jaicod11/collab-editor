/**
 * pages/DocumentDashboard.jsx — New UI (Stitch v2)
 * Dark mode dashboard: floating gradient orbs, glass sidebar, shimmer
 * recent-doc cards with teal hover glow, full document table, glowing FAB.
 */

import { useState, useEffect, useMemo, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { useDocument } from "../hooks/useDocument";
import { useToast }    from "../components/UI/Toast";
import { useAuthStore } from "../store/authSlice";

const ANIM_STYLES = `
  @keyframes float {
    0%   { transform:translate(0,0) scale(1);       }
    33%  { transform:translate(30px,-50px) scale(1.1); }
    66%  { transform:translate(-20px,20px) scale(.9);  }
    100% { transform:translate(0,0) scale(1);       }
  }
  @keyframes shimmer {
    0%   { background-position:-200% 0; }
    100% { background-position:200% 0;  }
  }
  .orb-float  { animation:float 20s infinite ease-in-out; }
  .orb-float2 { animation:float 25s infinite ease-in-out reverse; }
  .orb-float3 { animation:float 30s infinite ease-in-out; }
  .shimmer-bar {
    background:linear-gradient(90deg,rgba(255,255,255,0) 0%,rgba(255,255,255,.06) 50%,rgba(255,255,255,0) 100%);
    background-size:200% 100%;
    animation:shimmer 2s infinite linear;
  }
  .glass { background:rgba(255,255,255,.03); backdrop-filter:blur(20px); border:1px solid rgba(255,255,255,.1); }
  .scrollbar-hide::-webkit-scrollbar { display:none; }
  .scrollbar-hide { -ms-overflow-style:none; scrollbar-width:none; }
`;

// ─── Helpers ──────────────────────────────────────────────────────────────────
function ownerName(o) {
  if (!o) return "Unknown";
  if (typeof o === "object") return o.name ?? o.email ?? "Unknown";
  return String(o);
}
function ownerInitials(o) {
  return ownerName(o).split(" ").map((n) => n[0]).join("").toUpperCase().slice(0, 2);
}
function docId(d) { return d._id ?? d.id ?? ""; }
function fmtDate(d) {
  if (!d) return "—";
  const dt = new Date(d);
  const now = new Date();
  const diff = now - dt;
  if (diff < 3600000)  return `${Math.round(diff/60000)} min ago`;
  if (diff < 86400000) return `${Math.round(diff/3600000)}h ago`;
  if (diff < 172800000) return "Yesterday";
  return dt.toLocaleDateString(undefined, { month:"short", day:"numeric", year:"numeric" });
}

// ─── Mock fallback data ───────────────────────────────────────────────────────
const MOCK_RECENT = [
  { _id:"r1", title:"Q4 Growth Strategy",    updatedAt:new Date(Date.now()-7200000),  preview:[100,80,100,60] },
  { _id:"r2", title:"Product Roadmap 2024",  updatedAt:new Date(Date.now()-86400000), preview:[90,70,100,50]  },
  { _id:"r3", title:"Design Guidelines",     updatedAt:new Date(Date.now()-259200000),preview:[100,100,60,80] },
  { _id:"r4", title:"Marketing Assets",      updatedAt:new Date(Date.now()-604800000),preview:[50,80,90,100]  },
  { _id:"r5", title:"Meeting Notes",         updatedAt:new Date(Date.now()-777600000),preview:[100,30,40,20]  },
];
const MOCK_DOCS = [
  { _id:"d1", title:"Project Phoenix Specs",icon:"description", owner:"Alex Rivera",    updatedAt:new Date(Date.now()-172800000),  collaborators:3,  status:"Active"   },
  { _id:"d2", title:"Brand Identity Kit",   icon:"article",     owner:"Sarah Chen",     updatedAt:new Date(Date.now()-345600000),  collaborators:2,  status:"Active"   },
  { _id:"d3", title:"2023 Budget Review",   icon:"archive",     owner:"Alex Rivera",    updatedAt:new Date(Date.now()-3456000000), collaborators:1,  status:"Archived" },
  { _id:"d4", title:"Internal Policy 2.4",  icon:"feed",        owner:"Elena Moss",     updatedAt:new Date(Date.now()-432000000),  collaborators:12, status:"Active"   },
];
const ITEMS_PER_PAGE = 4;
const FILTERS = ["All","Mine","Shared"];

// ─── Recent shimmer card ──────────────────────────────────────────────────────
function RecentCard({ doc, onClick }) {
  const bars = doc.preview ?? [100, 80, 100, 50];
  return (
    <div className="flex-shrink-0 group cursor-pointer" onClick={() => onClick(doc)}>
      <div className="w-[200px] h-[160px] glass rounded-2xl p-5 flex flex-col gap-3
        group-hover:-translate-y-2 group-hover:border-cyan-500/50
        group-hover:shadow-[0_10px_30px_rgba(34,211,238,0.18)]
        transition-all duration-300">
        {bars.map((w, i) => (
          <div key={i} className={`h-2 rounded-full bg-white/10 shimmer-bar ${i === bars.length - 1 ? "mt-auto" : ""}`} style={{ width:`${w}%` }} />
        ))}
      </div>
      <div className="mt-4 px-1">
        <p className="text-sm font-bold text-white truncate">{doc.title ?? "Untitled"}</p>
        <div className="flex items-center justify-between mt-1">
          <span className="text-[11px] text-white/40">{fmtDate(doc.updatedAt)}</span>
          <div className="w-5 h-5 rounded-full bg-indigo-500 flex items-center justify-center text-[8px] font-bold text-white">
            {ownerInitials(doc.owner)}
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Filter pills ─────────────────────────────────────────────────────────────
function FilterPills({ active, onChange }) {
  return (
    <div className="flex items-center gap-2 p-1 rounded-xl border border-white/5" style={{ background:"rgba(255,255,255,0.05)" }}>
      {FILTERS.map((f) => (
        <button key={f} onClick={() => onChange(f)}
          className={`px-4 py-1.5 text-xs font-bold rounded-lg transition-all
            ${active === f
              ? "bg-cyan-500/20 text-cyan-400 border border-cyan-500/30"
              : "text-white/50 hover:text-white"}`}>
          {f}
        </button>
      ))}
    </div>
  );
}

// ─── ROOT: DocumentDashboard ──────────────────────────────────────────────────
export default function DocumentDashboard() {
  const navigate = useNavigate();
  const { toast } = useToast();
  const user = useAuthStore((s) => s.user);
  const { loading, loadDocuments, createDoc } = useDocument();

  const [search,     setSearch]     = useState("");
  const [filter,     setFilter]     = useState("All");
  const [page,       setPage]       = useState(1);
  const [allDocs,    setAllDocs]    = useState(MOCK_DOCS);
  const [recentDocs, setRecentDocs] = useState(MOCK_RECENT);

  useEffect(() => {
    loadDocuments().then((data) => {
      if (Array.isArray(data?.documents) && data.documents.length) {
        setAllDocs(data.documents);
        setRecentDocs(data.documents.slice(0, 5).map((d, i) => ({ ...d, preview: MOCK_RECENT[i % MOCK_RECENT.length].preview })));
      }
    }).catch(() => {});
  }, []);

  const filteredDocs = useMemo(() => {
    let docs = Array.isArray(allDocs) ? allDocs : [];
    const userName = user?.name?.toLowerCase() ?? "";
    if (filter === "Mine")   docs = docs.filter((d) => ownerName(d.owner).toLowerCase() === userName || ownerName(d.owner).toLowerCase() === "you");
    if (filter === "Shared") docs = docs.filter((d) => ownerName(d.owner).toLowerCase() !== userName && ownerName(d.owner).toLowerCase() !== "you");
    if (search.trim()) docs = docs.filter((d) => (d.title ?? "").toLowerCase().includes(search.toLowerCase()));
    return docs;
  }, [allDocs, filter, search, user]);

  const totalPages = Math.max(1, Math.ceil(filteredDocs.length / ITEMS_PER_PAGE));
  const pagedDocs  = filteredDocs.slice((page - 1) * ITEMS_PER_PAGE, page * ITEMS_PER_PAGE);

  useEffect(() => setPage(1), [filter, search]);

  const handleOpen = useCallback((doc) => navigate(`/editor/${docId(doc)}`), [navigate]);
  const handleNew  = useCallback(async () => {
    const doc = await createDoc("Untitled Document");
    if (doc) navigate(`/editor/${docId(doc)}`);
    else toast.error("Failed to create document");
  }, [createDoc, navigate, toast]);

  const logout = useAuthStore((s) => s.logout);

  return (
    <div className="min-h-screen overflow-x-hidden" style={{ background:"#070d1a", fontFamily:"Manrope,sans-serif", color:"#dee1f7" }}>
      <style>{ANIM_STYLES}</style>

      {/* Background orbs */}
      <div className="fixed inset-0 overflow-hidden pointer-events-none -z-10">
        <div className="orb-float  absolute top-[-10%] left-[-10%] w-[500px] h-[500px] rounded-full" style={{ background:"rgba(124,58,237,0.12)", filter:"blur(120px)" }} />
        <div className="orb-float2 absolute bottom-[10%] right-[-5%] w-[600px] h-[600px] rounded-full" style={{ background:"rgba(14,165,233,0.10)", filter:"blur(120px)" }} />
        <div className="orb-float3 absolute top-[30%] left-[40%] w-[400px] h-[400px] rounded-full" style={{ background:"rgba(79,70,229,0.08)", filter:"blur(120px)" }} />
      </div>

      {/* Top navbar */}
      <header className="fixed top-0 w-full z-50 flex items-center justify-between px-10 h-20 border-b border-white/5"
        style={{ background:"rgba(0,0,0,0.4)", backdropFilter:"blur(20px)" }}>
        {/* Logo */}
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl flex items-center justify-center"
            style={{ background:"linear-gradient(135deg,#22d3ee,#6366f1)", boxShadow:"0 0 20px rgba(34,211,238,0.4)" }}>
            <span className="material-symbols-outlined text-white text-2xl">description</span>
          </div>
          <span className="text-2xl font-black tracking-tight"
            style={{ background:"linear-gradient(to right,#22d3ee,#818cf8)", WebkitBackgroundClip:"text", WebkitTextFillColor:"transparent" }}>
            CollabDocs
          </span>
        </div>

        {/* Search */}
        <div className="hidden md:flex flex-1 max-w-xl mx-12">
          <div className="relative w-full group">
            <span className="material-symbols-outlined absolute left-4 top-1/2 -translate-y-1/2 text-white/40 group-focus-within:text-cyan-400 transition-colors text-sm">search</span>
            <input value={search} onChange={(e) => setSearch(e.target.value)} type="text" placeholder="Search documents…"
              className="w-full rounded-full py-2.5 pl-12 pr-4 text-sm outline-none transition-all placeholder:text-white/20 text-white"
              style={{ background:"rgba(255,255,255,0.05)", border:"1px solid rgba(255,255,255,0.1)" }}
              onFocus={(e) => e.target.style.boxShadow = "0 0 0 2px rgba(34,211,238,0.25)"}
              onBlur={(e)  => e.target.style.boxShadow = "none"}
            />
          </div>
        </div>

        {/* Right */}
        <div className="flex items-center gap-4">
          {["notifications","settings"].map((icon) => (
            <button key={icon} className="w-10 h-10 rounded-full flex items-center justify-center text-white/60 hover:text-white hover:bg-white/5 transition-all">
              <span className="material-symbols-outlined">{icon}</span>
            </button>
          ))}
          <div className="h-8 w-px bg-white/10 mx-2" />
          <div className="flex items-center gap-2 group cursor-pointer relative" onClick={() => { logout(); navigate("/auth"); }}>
            <div className="relative">
              <div className="w-10 h-10 rounded-full bg-gradient-to-br from-cyan-400 to-indigo-500 flex items-center justify-center text-xs font-black text-white">
                {user?.name?.slice(0, 2).toUpperCase() ?? "ME"}
              </div>
              <div className="absolute bottom-0 right-0 w-3 h-3 bg-green-500 border-2 border-[#070d1a] rounded-full" />
            </div>
            <span className="text-sm font-semibold text-white/80 hidden sm:inline">{user?.name ?? "User"}</span>
          </div>
        </div>
      </header>

      {/* Left sidebar */}
      <aside className="fixed left-0 top-0 h-screen w-64 pt-24 hidden lg:flex flex-col gap-2 border-r border-white/10"
        style={{ background:"rgba(15,23,42,0.2)", backdropFilter:"blur(32px)" }}>
        <div className="px-6 mb-6">
          <div className="flex items-center gap-3 p-3 rounded-2xl" style={{ background:"rgba(255,255,255,0.05)" }}>
            <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-cyan-400 to-indigo-500" />
            <div>
              <p className="text-sm font-bold text-white">Pro Workspace</p>
              <p className="text-[10px] text-white/50 uppercase tracking-widest">Creative Studio</p>
            </div>
          </div>
        </div>
        <nav className="flex flex-col px-3">
          {[
            { icon:"dashboard",   label:"Dashboard",     active:true  },
            { icon:"description", label:"Documents",     active:false },
            { icon:"group",       label:"Collaboration", active:false },
            { icon:"inventory_2", label:"Archive",       active:false },
          ].map(({ icon, label, active }) => (
            <a key={label} href="#"
              className={`flex items-center gap-4 py-3 px-4 rounded-xl transition-all mb-0.5
                ${active
                  ? "bg-gradient-to-r from-cyan-500/20 to-transparent text-cyan-400 border-l-4 border-cyan-400"
                  : "text-white/50 hover:bg-white/5 hover:text-white border-l-4 border-transparent"}`}>
              <span className="material-symbols-outlined">{icon}</span>
              <span className="font-medium text-sm">{label}</span>
            </a>
          ))}
        </nav>
        <div className="mt-auto px-3 pb-8 flex flex-col gap-1">
          {[{icon:"help",label:"Help"},{icon:"settings",label:"Settings"}].map(({icon,label}) => (
            <a key={label} href="#" className="flex items-center gap-4 text-white/50 py-3 px-4 hover:bg-white/5 hover:text-white transition-all rounded-xl">
              <span className="material-symbols-outlined">{icon}</span>
              <span className="font-medium text-sm">{label}</span>
            </a>
          ))}
        </div>
      </aside>

      {/* Main content */}
      <main className="lg:ml-64 pt-28 px-6 lg:px-10 pb-20">

        {/* Recent Documents */}
        <section className="mb-12">
          <div className="flex items-center justify-between mb-6">
            <h2 className="text-2xl font-black text-white tracking-tight">Recent Documents</h2>
            <button className="text-sm font-bold text-cyan-400 hover:text-cyan-300 transition-colors">View All</button>
          </div>
          <div className="flex gap-6 overflow-x-auto pb-4 scrollbar-hide">
            {recentDocs.map((doc) => (
              <RecentCard key={docId(doc)} doc={doc} onClick={handleOpen} />
            ))}
          </div>
        </section>

        {/* All Documents */}
        <section>
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-8">
            <h2 className="text-2xl font-black text-white tracking-tight">All Documents</h2>
            <FilterPills active={filter} onChange={setFilter} />
          </div>

          <div className="rounded-3xl border border-white/10 overflow-hidden shadow-2xl" style={{ background:"rgba(255,255,255,0.03)", backdropFilter:"blur(20px)" }}>
            <div className="overflow-x-auto">
              <table className="w-full text-left">
                <thead>
                  <tr className="border-b border-white/5">
                    {["Title","Owner","Last Modified","Collaborators","Status","Actions"].map((h, i) => (
                      <th key={h} className={`px-8 py-5 text-[11px] uppercase tracking-widest text-white/40 font-bold ${i === 5 ? "text-right" : ""}`}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/5">
                  {loading ? (
                    <tr><td colSpan={6} className="px-8 py-12 text-center text-white/30 text-sm">
                      <svg className="animate-spin h-5 w-5 mx-auto text-cyan-400" viewBox="0 0 24 24" fill="none">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/>
                      </svg>
                    </td></tr>
                  ) : pagedDocs.length === 0 ? (
                    <tr><td colSpan={6} className="px-8 py-12 text-center text-white/30 text-sm">No documents found.</td></tr>
                  ) : pagedDocs.map((doc) => (
                    <tr key={docId(doc)} className="group hover:bg-white/[0.02] transition-colors cursor-pointer" onClick={() => handleOpen(doc)}>
                      <td className="px-8 py-4">
                        <div className="flex items-center gap-3">
                          <div className="w-8 h-8 rounded-lg bg-indigo-500/20 flex items-center justify-center text-indigo-400 group-hover:scale-110 transition-transform">
                            <span className="material-symbols-outlined text-xl">{doc.icon ?? "description"}</span>
                          </div>
                          <span className="text-sm font-semibold text-white">{doc.title ?? "Untitled"}</span>
                        </div>
                      </td>
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-2">
                          <div className="w-6 h-6 rounded-full bg-gradient-to-br from-cyan-400 to-indigo-500 flex items-center justify-center text-[10px] font-bold text-white">
                            {ownerInitials(doc.owner)}
                          </div>
                          <span className="text-xs text-white/70">{ownerName(doc.owner)}</span>
                        </div>
                      </td>
                      <td className="px-6 py-4 text-xs text-white/40">{fmtDate(doc.updatedAt)}</td>
                      <td className="px-6 py-4">
                        <div className="flex -space-x-1.5">
                          {Array.isArray(doc.collaborators)
                            ? doc.collaborators.slice(0, 3).map((_, i) => (
                                <div key={i} className="w-6 h-6 rounded-full border border-[#1a1f2f] bg-indigo-500 flex items-center justify-center text-[9px] font-bold text-white">
                                  {String.fromCharCode(65 + i)}
                                </div>
                              ))
                            : (
                              <div className="w-6 h-6 rounded-full border border-[#1a1f2f] bg-slate-700 flex items-center justify-center text-[10px] font-bold text-white">
                                +{doc.collaborators ?? 0}
                              </div>
                            )
                          }
                        </div>
                      </td>
                      <td className="px-6 py-4">
                        <span className={`px-2 py-1 rounded-md text-[10px] font-bold uppercase tracking-wider
                          ${doc.status === "Active"
                            ? "bg-green-500/10 text-green-400"
                            : "bg-white/5 text-white/30"}`}>
                          {doc.status ?? "Active"}
                        </span>
                      </td>
                      <td className="px-8 py-4 text-right">
                        <button className="text-white/30 hover:text-white transition-colors" onClick={(e) => e.stopPropagation()}>
                          <span className="material-symbols-outlined">more_vert</span>
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Pagination */}
            <div className="px-8 py-4 border-t border-white/5 flex items-center justify-between">
              <span className="text-xs text-white/30">
                {filteredDocs.length === 0 ? "No documents" : `Showing ${(page-1)*ITEMS_PER_PAGE+1}–${Math.min(page*ITEMS_PER_PAGE,filteredDocs.length)} of ${filteredDocs.length}`}
              </span>
              <div className="flex gap-2">
                <button disabled={page === 1} onClick={() => setPage((p) => p-1)}
                  className="px-3 py-1 text-xs font-bold text-white/30 hover:text-white disabled:opacity-30">
                  Previous
                </button>
                <button disabled={page === totalPages} onClick={() => setPage((p) => p+1)}
                  className="px-3 py-1 text-xs font-bold text-cyan-400 hover:text-cyan-300 disabled:opacity-30">
                  Next
                </button>
              </div>
            </div>
          </div>
        </section>
      </main>

      {/* FAB */}
      <button onClick={handleNew}
        className="fixed bottom-10 right-10 w-16 h-16 rounded-full text-white flex items-center justify-center z-50
          hover:scale-110 hover:rotate-45 active:scale-95 transition-all duration-300"
        style={{ background:"linear-gradient(135deg,#22d3ee,#6366f1)", boxShadow:"0 10px 40px rgba(34,211,238,0.4)" }}>
        <span className="material-symbols-outlined text-3xl font-bold">add</span>
      </button>
    </div>
  );
}
