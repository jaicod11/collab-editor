/**
 * pages/EditorPage.jsx — New UI (Stitch v2)
 * Dark sidebar + white editor canvas split layout.
 * Sidebar: dark #0a0f1e with teal glow accents, gradient background.
 * Canvas: clean white with top navbar, formatting toolbar, remote cursors.
 * Bottom: dark glassmorphism floating format pill.
 * Status bar: dark with live/save indicators.
 */

import { useState, useRef, useCallback, useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";

import { useSocket }    from "../hooks/useSocket";
import { useDocument }  from "../hooks/useDocument";
import { useToast }     from "../components/UI/Toast";
import { useAuthStore } from "../store/authSlice";

import EditorCore          from "../components/Editor/EditorCore";
import VersionHistoryPanel from "../components/Sidebar/VersionHistoryPanel";

const ANIM_STYLES = `
  @keyframes blink { from,to{opacity:1} 50%{opacity:0} }
  .cursor-blink { animation:blink 1s step-end infinite; }
  .sidebar-grad {
    background: radial-gradient(circle at top right,rgba(0,212,255,.05),transparent),
                radial-gradient(circle at bottom left,rgba(96,1,209,.05),transparent);
  }
  .scrollbar-thin::-webkit-scrollbar { width:4px; }
  .scrollbar-thin::-webkit-scrollbar-thumb { background:rgba(255,255,255,.1); border-radius:10px; }
  .no-scrollbar::-webkit-scrollbar { display:none; }
  .no-scrollbar { -ms-overflow-style:none; scrollbar-width:none; }
`;

// ─── Toolbar button ────────────────────────────────────────────────────────────
function TBtn({ icon, label, onClick, active }) {
  return (
    <button title={label} onClick={onClick}
      className={`p-1.5 rounded transition-colors ${active ? "bg-indigo-100 text-indigo-600" : "hover:bg-slate-100 text-slate-600"}`}>
      <span className="material-symbols-outlined text-xl">{icon}</span>
    </button>
  );
}

function TDivider() {
  return <div className="h-6 w-px bg-slate-200 mx-1 flex-shrink-0" />;
}

// ─── Formatting toolbar ────────────────────────────────────────────────────────
function Toolbar({ disabled }) {
  const exec = (cmd) => { if (!disabled) document.execCommand(cmd, false, null); };
  const block = (tag) => { if (!disabled) document.execCommand("formatBlock", false, tag); };

  return (
    <div className="flex items-center gap-0.5 px-10 py-2.5 bg-white/50 border-b border-slate-100 overflow-x-auto no-scrollbar sticky top-16 z-30">
      <TBtn icon="format_bold"       label="Bold"          onClick={() => exec("bold")} />
      <TBtn icon="format_italic"     label="Italic"        onClick={() => exec("italic")} />
      <TBtn icon="format_underlined" label="Underline"     onClick={() => exec("underline")} />
      <TDivider />
      <div className="flex items-center">
        <select onChange={(e) => { if (e.target.value) { block(e.target.value); e.target.value=""; }}}
          defaultValue=""
          className="text-xs font-semibold text-slate-600 bg-transparent border-none outline-none cursor-pointer hover:bg-slate-100 px-2 py-1.5 rounded">
          <option value="" disabled>Heading</option>
          <option value="h1">H1</option>
          <option value="h2">H2</option>
          <option value="h3">H3</option>
          <option value="p">Paragraph</option>
        </select>
      </div>
      <TDivider />
      <TBtn icon="format_list_bulleted"  label="Bullet list"   onClick={() => exec("insertUnorderedList")} />
      <TBtn icon="format_list_numbered"  label="Numbered list" onClick={() => exec("insertOrderedList")} />
      <TDivider />
      <TBtn icon="format_align_left"   label="Align left"   onClick={() => exec("justifyLeft")} />
      <TBtn icon="format_align_center" label="Align center" onClick={() => exec("justifyCenter")} />
      <TDivider />
      <TBtn icon="palette" label="Color" onClick={() => {}} />
    </div>
  );
}

// ─── Sidebar document list ─────────────────────────────────────────────────────
function Sidebar({ docId: activeId, documents, onSelect, onNew, onClose }) {
  return (
    <aside className="w-[260px] flex-shrink-0 flex flex-col h-full border-r border-white/5 sidebar-grad relative"
      style={{ background:"#0a0f1e", fontFamily:"Manrope,sans-serif" }}>

      {/* Logo + collapse */}
      <div className="p-6">
        <div className="flex items-center justify-between gap-3 mb-8">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg flex items-center justify-center"
              style={{ background:"#00d4ff", boxShadow:"0 0 15px rgba(0,212,255,0.4)" }}>
              <span className="material-symbols-outlined text-white text-lg"
                style={{ fontVariationSettings:"'FILL' 1" }}>cloud_done</span>
            </div>
            <span className="text-xl font-black tracking-tighter text-white">CollabDocs</span>
          </div>
          <button onClick={onClose} className="text-white/40 hover:text-white transition-colors">
            <span className="material-symbols-outlined text-lg">menu_open</span>
          </button>
        </div>

        {/* New doc button */}
        <button onClick={onNew}
          className="w-full py-4 px-4 border-2 border-dashed border-white/10 rounded-xl mb-6 flex items-center justify-center gap-2 text-white/60 hover:border-[#00d4ff] hover:text-[#00d4ff] hover:bg-[#00d4ff]/5 transition-all duration-300 group">
          <span className="material-symbols-outlined group-hover:scale-110 transition-transform">add_circle</span>
          <span className="text-xs font-bold uppercase tracking-wider">+ New Document</span>
        </button>

        {/* Doc list */}
        <nav className="space-y-1 overflow-y-auto scrollbar-thin" style={{ maxHeight:"calc(100vh - 300px)" }}>
          {(Array.isArray(documents) ? documents : []).map((doc) => {
            const id = doc._id ?? doc.id ?? "";
            const isActive = id === activeId;
            return (
              <div key={id} onClick={() => onSelect(id)}
                className={`px-2 py-3 rounded-lg flex items-center gap-3 cursor-pointer transition-all
                  ${isActive
                    ? "bg-white/10 text-[#00d4ff] border-l-4 border-[#00d4ff]"
                    : "text-white/40 hover:text-white/80 hover:bg-white/5 border-l-4 border-transparent"}`}
                style={isActive ? { boxShadow:"0 0 20px rgba(0,212,255,0.1)" } : {}}>
                <span className="material-symbols-outlined text-lg flex-shrink-0">description</span>
                <span className="text-sm truncate font-semibold">{doc.title ?? "Untitled"}</span>
              </div>
            );
          })}
        </nav>
      </div>

      {/* Bottom */}
      <div className="mt-auto p-6 space-y-4 border-t border-white/5">
        {[{icon:"settings",label:"Settings"},{icon:"help",label:"Support"}].map(({icon,label}) => (
          <div key={label} className="flex items-center gap-3 text-white/40 hover:text-white transition-colors cursor-pointer">
            <span className="material-symbols-outlined text-lg">{icon}</span>
            <span className="text-xs font-bold uppercase tracking-widest">{label}</span>
          </div>
        ))}
      </div>
    </aside>
  );
}

// ─── Status bar ───────────────────────────────────────────────────────────────
function StatusBar({ saveStatus, connected, wordCount }) {
  return (
    <footer className="h-8 border-t border-white/5 flex items-center justify-between px-6 flex-shrink-0"
      style={{ background:"#090e1c" }}>
      <div className="flex items-center gap-6">
        <div className="flex items-center gap-2">
          <div className={`w-2 h-2 rounded-full ${connected ? "bg-emerald-400 animate-pulse" : "bg-red-400"}`} />
          <span className="text-[10px] font-bold text-white/40 uppercase tracking-widest">
            {connected ? "System Online" : "Reconnecting"}
          </span>
        </div>
        <div className="flex items-center gap-2">
          <span className="material-symbols-outlined text-white/40" style={{ fontSize:12 }}>sync</span>
          <span className="text-[10px] font-bold text-white/40 uppercase tracking-widest">{saveStatus}</span>
        </div>
      </div>
      <div className="flex items-center gap-4">
        <span className="text-[10px] font-bold text-white/40 uppercase tracking-widest">{wordCount} words</span>
        <span className="text-[10px] font-bold text-white/40 uppercase tracking-widest">UTF-8</span>
      </div>
    </footer>
  );
}

// ─── ROOT: EditorPage ─────────────────────────────────────────────────────────
export default function EditorPage() {
  const { docId }   = useParams();
  const navigate    = useNavigate();
  const { toast }   = useToast();
  const currentUser = useAuthStore((s) => s.user);

  const [title,        setTitle]        = useState("Untitled Document");
  const [saveStatus,   setSaveStatus]   = useState("All changes saved");
  const [showHistory,  setShowHistory]  = useState(false);
  const [sidebarOpen,  setSidebarOpen]  = useState(true);
  const [collaborators,setCollaborators]= useState([]);
  const [revision,     setRevision]     = useState(0);
  const [wordCount,    setWordCount]    = useState(0);

  const editorCoreRef = useRef(null);
  const saveTimer     = useRef(null);
  const titleTimer    = useRef(null);

  const { socket, connected }                        = useSocket(docId);
  const { activeDocument, documents, updateTitle, createDoc, loadDocuments } = useDocument();

  // Load documents for sidebar
  useEffect(() => { loadDocuments(); }, []);

  // Title from server
  useEffect(() => {
    if (activeDocument?.title) setTitle(activeDocument.title);
  }, [activeDocument]);

  useEffect(() => {
    if (!socket) return;
    const onLoad = ({ title: t }) => { if (t) setTitle(t); };
    const onErr  = ({ message }) => toast.error(message);
    socket.on("doc:load",  onLoad);
    socket.on("doc:error", onErr);
    return () => { socket.off("doc:load", onLoad); socket.off("doc:error", onErr); };
  }, [socket, toast]);

  const handleContentChange = useCallback((content) => {
    setSaveStatus("Saving…");
    const words = (content ?? "").trim().split(/\s+/).filter(Boolean).length;
    setWordCount(words);
    clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => setSaveStatus("All changes saved"), 1500);
  }, []);

  const handleTitleInput = useCallback((e) => {
    const t = e.currentTarget.textContent ?? "";
    setTitle(t);
    clearTimeout(titleTimer.current);
    titleTimer.current = setTimeout(async () => {
      if (docId && t.trim()) {
        try { await updateTitle(docId, t.trim()); }
        catch { toast.error("Failed to save title"); }
      }
    }, 800);
  }, [docId, updateTitle, toast]);

  const handleDocSelect = useCallback((id) => navigate(`/editor/${id}`), [navigate]);
  const handleNewDoc    = useCallback(async () => {
    const doc = await createDoc("Untitled Document");
    if (doc) navigate(`/editor/${doc._id ?? doc.id}`);
    else toast.error("Failed to create document");
  }, [createDoc, navigate, toast]);

  const handleRestore = useCallback((v) => {
    toast.success(`Restored to version from ${v.timestamp}`);
    setShowHistory(false);
  }, [toast]);

  useEffect(() => () => {
    clearTimeout(saveTimer.current);
    clearTimeout(titleTimer.current);
  }, []);

  const onlineCount = collaborators.length + 1;

  return (
    <div className="flex h-screen overflow-hidden" style={{ background:"#090e1c", fontFamily:"Manrope,sans-serif" }}>
      <style>{ANIM_STYLES}</style>

      {/* Sidebar */}
      {sidebarOpen && (
        <Sidebar
          docId={docId}
          documents={documents}
          onSelect={handleDocSelect}
          onNew={handleNewDoc}
          onClose={() => setSidebarOpen(false)}
        />
      )}

      {/* Main editor area */}
      <main className="flex-grow flex flex-col overflow-hidden bg-white relative">

        {/* Top navbar */}
        <header className="h-16 flex items-center justify-between px-6 md:px-10 bg-white/80 backdrop-blur-md sticky top-0 z-50 border-b border-slate-100 flex-shrink-0">

          {/* Left */}
          <div className="flex items-center gap-3 min-w-0">
            {!sidebarOpen && (
              <button onClick={() => setSidebarOpen(true)}
                className="p-2 rounded-lg hover:bg-slate-100 transition-colors flex-shrink-0">
                <span className="material-symbols-outlined text-slate-500 text-xl">menu</span>
              </button>
            )}
            <button onClick={() => navigate("/")}
              className="p-2 rounded-lg hover:bg-slate-100 transition-colors flex-shrink-0">
              <span className="material-symbols-outlined text-slate-500 text-xl">arrow_back</span>
            </button>

            {/* Editable title */}
            <h1
              contentEditable suppressContentEditableWarning
              onInput={handleTitleInput}
              data-placeholder="Untitled Document"
              className="text-xl font-black text-slate-900 tracking-tight outline-none focus:ring-0 truncate
                empty:before:content-[attr(data-placeholder)] empty:before:text-slate-300"
            >
              {title}
            </h1>
          </div>

          {/* Center: presence avatars */}
          <div className="flex items-center gap-3 flex-shrink-0">
            <div className="flex -space-x-2">
              {collaborators.slice(0, 3).map((c) => (
                <div key={c.userId} title={c.name}
                  className={`w-8 h-8 rounded-full border-2 border-white flex items-center justify-center text-[10px] font-black text-white ${c.color ?? "bg-cyan-500"}`}
                  style={{ boxShadow:"0 0 0 2px #00d4ff" }}>
                  {c.initials ?? c.name?.slice(0,2).toUpperCase()}
                </div>
              ))}
              {collaborators.length === 0 && (
                <div className="w-8 h-8 rounded-full border-2 border-white bg-cyan-500 flex items-center justify-center text-[10px] font-black text-white">
                  {currentUser?.name?.slice(0, 2).toUpperCase() ?? "ME"}
                </div>
              )}
              {collaborators.length > 3 && (
                <div className="w-8 h-8 rounded-full border-2 border-white bg-slate-200 flex items-center justify-center text-[10px] font-black text-slate-600">
                  +{collaborators.length - 3}
                </div>
              )}
            </div>

            <div className="h-4 w-px bg-slate-200" />

            {/* Action buttons */}
            <div className="flex items-center gap-1">
              <button className="p-2 text-slate-400 hover:bg-slate-100 rounded-lg transition-colors" title="Collaborators">
                <span className="material-symbols-outlined">group</span>
              </button>
              <button onClick={() => setShowHistory(true)}
                className="p-2 text-slate-400 hover:bg-slate-100 rounded-lg transition-colors" title="Version history">
                <span className="material-symbols-outlined">history</span>
              </button>
              <button className="p-2 text-[#00d4ff] hover:bg-cyan-50 rounded-lg transition-colors" title="Saved">
                <span className="material-symbols-outlined" style={{ fontVariationSettings:"'FILL' 1" }}>cloud_done</span>
              </button>
            </div>

            <button className="px-6 py-2 text-white font-bold rounded-full text-sm transition-all hover:scale-105"
              style={{ background:"#00d4ff", boxShadow:"0 4px 20px rgba(0,212,255,0.35)", color:"#003642" }}>
              Share
            </button>
          </div>
        </header>

        {/* Formatting toolbar */}
        <Toolbar disabled={!connected} />

        {/* Editor canvas */}
        <div className="flex-grow overflow-y-auto scrollbar-thin bg-slate-50/30 pb-40">
          <div className="max-w-[720px] mx-auto bg-white min-h-[calc(100vh-200px)] shadow-sm ring-1 ring-black/5 p-10 md:p-20 relative my-8">

            {/* Last edited strip */}
            <div className="flex items-center gap-2 mb-8 text-[11px] font-bold text-slate-400 uppercase tracking-widest border-b border-slate-100 pb-4">
              <span className="material-symbols-outlined text-sm">edit_note</span>
              {connected
                ? `Live · rev ${revision} · ${onlineCount} user${onlineCount !== 1 ? "s" : ""} online`
                : "Offline — changes will sync when reconnected"
              }
            </div>

            {/* EditorCore — sole owner of useOT */}
            <EditorCore
              ref={editorCoreRef}
              docId={docId}
              socket={socket}
              connected={connected}
              currentUser={currentUser}
              initialContent={activeDocument?.content ?? ""}
              onContentChange={handleContentChange}
              onCollaboratorsChange={setCollaborators}
              onRevisionChange={setRevision}
              className="text-slate-800 text-[17px] leading-[1.85]"
            />
          </div>
        </div>
      </main>

      {/* Floating format pill */}
      <nav className="fixed bottom-12 left-1/2 -translate-x-1/2 z-50 flex items-center px-6 py-3 gap-6 rounded-2xl border border-white/10 shadow-2xl"
        style={{ background:"rgba(15,23,42,0.92)", backdropFilter:"blur(24px)", boxShadow:"0 20px 60px rgba(0,212,255,0.12)" }}>
        {[
          { icon:"format_bold",   label:"Bold",    cmd:"bold"   },
          { icon:"format_italic", label:"Italic",  cmd:"italic" },
        ].map(({ icon, label, cmd }) => (
          <button key={cmd}
            onClick={() => document.execCommand(cmd, false, null)}
            className="text-white/70 hover:text-white hover:scale-110 transition-transform flex flex-col items-center gap-1">
            <span className="material-symbols-outlined text-sm">{icon}</span>
            <span className="text-[10px] font-bold">{label}</span>
          </button>
        ))}
        <button className="text-cyan-400 scale-110 flex flex-col items-center gap-1"
          onClick={() => { const url = window.prompt("Enter URL:"); if (url) document.execCommand("createLink", false, url); }}>
          <span className="material-symbols-outlined text-sm">link</span>
          <span className="text-[10px] font-bold">Link</span>
        </button>
        <button className="text-white/70 hover:text-white hover:scale-110 transition-transform flex flex-col items-center gap-1">
          <span className="material-symbols-outlined text-sm">add_comment</span>
          <span className="text-[10px] font-bold">Comment</span>
        </button>
        <div className="h-8 w-px bg-white/10 mx-2" />
        <button className="px-5 py-2 font-black text-xs rounded-lg hover:scale-105 active:scale-95 transition-all"
          style={{ background:"#00d4ff", color:"#003642", boxShadow:"0 4px 15px rgba(0,212,255,0.3)" }}>
          PUBLISH
        </button>
      </nav>

      {/* Status bar */}
      <StatusBar saveStatus={saveStatus} connected={connected} wordCount={wordCount} />

      {/* Version history panel */}
      <VersionHistoryPanel
        isOpen={showHistory}
        onClose={() => setShowHistory(false)}
        docId={docId}
        onRestore={handleRestore}
      />
    </div>
  );
}
