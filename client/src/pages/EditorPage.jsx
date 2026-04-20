/**
 * pages/EditorPage.jsx — FIXED
 * ─────────────────────────────────────────────────────────────────────────────
 * KEY FIX: useOT and usePresence are called ONLY inside EditorCore.
 * This page was previously also calling them, causing every op to be
 * applied twice — producing palindromes and garbled text.
 *
 * Data flow:
 *   EditorPage → socket → EditorCore → useOT / usePresence
 *   EditorCore → onCollaboratorsChange → EditorPage state
 *   EditorCore → onRevisionChange      → EditorPage state
 */

import { useState, useRef, useCallback, useEffect } from "react";
import { useParams, useNavigate }  from "react-router-dom";

import { useSocket }    from "../hooks/useSocket";
import { useDocument }  from "../hooks/useDocument";
import { useToast }     from "../components/UI/Toast";
import { useAuthStore } from "../store/authSlice";

import EditorCore          from "../components/Editor/EditorCore";
import Toolbar             from "../components/Editor/Toolbar";
import PresenceAvatars     from "../components/Editor/PresenceAvatars";
import DocumentList        from "../components/Sidebar/DocumentList";
import VersionHistoryPanel from "../components/Sidebar/VersionHistoryPanel";

// ─── Status bar ───────────────────────────────────────────────────────────────
function StatusBar({ saveStatus, connected, onlineCount }) {
  return (
    <div className="flex items-center justify-between px-6 py-1.5 border-t border-outline-variant/10 bg-surface-container-lowest text-[11px] text-on-surface-variant flex-shrink-0">
      <span>{saveStatus}</span>
      <div className="flex items-center gap-2">
        <span className={`w-2 h-2 rounded-full transition-colors ${connected ? "bg-green-400" : "bg-red-400 animate-pulse"}`} />
        <span>{connected ? `${onlineCount} user${onlineCount !== 1 ? "s" : ""} online` : "Reconnecting…"}</span>
      </div>
    </div>
  );
}

// ─── ROOT: EditorPage ─────────────────────────────────────────────────────────
export default function EditorPage() {
  const { docId }   = useParams();
  const navigate    = useNavigate();
  const { toast }   = useToast();
  const currentUser = useAuthStore((s) => s.user);

  // ── Local UI state ────────────────────────────────────────────────────────
  const [title,        setTitle]        = useState("Untitled Document");
  const [saveStatus,   setSaveStatus]   = useState("All changes saved");
  const [showHistory,  setShowHistory]  = useState(false);
  const [sidebarOpen,  setSidebarOpen]  = useState(true);

  // ── Data from EditorCore (via callbacks) ──────────────────────────────────
  // These are updated by EditorCore when its internal hooks produce new values.
  const [collaborators, setCollaborators] = useState([]);
  const [revision,      setRevision]      = useState(0);

  const editorCoreRef = useRef(null);
  const saveTimer     = useRef(null);
  const titleTimer    = useRef(null);

  // ── Socket — one connection, passed to EditorCore ─────────────────────────
  // EditorCore passes it to useOT and usePresence internally.
  // DO NOT call useOT or usePresence here — that was the bug.
  const { socket, connected } = useSocket(docId);

  // ── REST document operations ──────────────────────────────────────────────
  const { activeDocument, updateTitle, createDoc } = useDocument();

  // Set title from loaded document
  useEffect(() => {
    if (activeDocument?.title) setTitle(activeDocument.title);
  }, [activeDocument]);

  // Socket error toast
  useEffect(() => {
    if (!socket) return;
    const onErr = ({ message }) => toast.error(message);
    socket.on("doc:error", onErr);
    return () => socket.off("doc:error", onErr);
  }, [socket, toast]);

  // Socket doc:load — update title from server
  useEffect(() => {
    if (!socket) return;
    const onLoad = ({ title: t }) => { if (t) setTitle(t); };
    socket.on("doc:load", onLoad);
    return () => socket.off("doc:load", onLoad);
  }, [socket]);

  // ── Autosave content (debounced 1.5s) ────────────────────────────────────
  const handleContentChange = useCallback(() => {
    setSaveStatus("Saving…");
    clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => setSaveStatus("All changes saved"), 1500);
  }, []);

  // ── Autosave title (debounced 800ms) ─────────────────────────────────────
  const handleTitleInput = useCallback((e) => {
    const newTitle = e.currentTarget.textContent ?? "";
    setTitle(newTitle);
    clearTimeout(titleTimer.current);
    titleTimer.current = setTimeout(async () => {
      if (docId && newTitle.trim()) {
        try { await updateTitle(docId, newTitle.trim()); }
        catch { toast.error("Failed to save title"); }
      }
    }, 800);
  }, [docId, updateTitle, toast]);

  // ── Navigation helpers ────────────────────────────────────────────────────
  const handleDocSelect = useCallback((id) => navigate(`/editor/${id}`), [navigate]);

  const handleNewDoc = useCallback(async () => {
    const doc = await createDoc("Untitled Document");
    if (doc) navigate(`/editor/${doc._id ?? doc.id}`);
    else toast.error("Failed to create document");
  }, [createDoc, navigate, toast]);

  const handleRestore = useCallback((version) => {
    toast.success(`Restored to version from ${version.timestamp}`);
    setShowHistory(false);
  }, [toast]);

  // Cleanup timers
  useEffect(() => () => {
    clearTimeout(saveTimer.current);
    clearTimeout(titleTimer.current);
  }, []);

  const onlineCount = collaborators.length + 1;

  return (
    <div className="bg-surface text-on-surface min-h-screen flex flex-col overflow-hidden">

      {/* ── Top navigation bar ────────────────────────────────────────────── */}
      <header className="w-full sticky top-0 bg-white/90 backdrop-blur-md flex items-center justify-between px-4 py-2.5 shadow-[0_20px_50px_rgba(25,49,93,0.04)] z-40 flex-shrink-0 gap-4">

        {/* Left */}
        <div className="flex items-center gap-2 flex-shrink-0">
          <button
            onClick={() => setSidebarOpen((o) => !o)}
            className="p-2 rounded-lg hover:bg-surface-container-high transition-colors"
            title="Toggle sidebar"
          >
            <span className="material-symbols-outlined text-on-surface-variant text-[20px]">
              {sidebarOpen ? "menu_open" : "menu"}
            </span>
          </button>
          <button
            onClick={() => navigate("/")}
            className="p-2 rounded-lg hover:bg-surface-container-high transition-colors"
            title="Back to dashboard"
          >
            <span className="material-symbols-outlined text-on-surface-variant text-[20px]">arrow_back</span>
          </button>
          <span className="text-lg font-headline font-bold tracking-tight text-on-surface hidden sm:block">
            CollabDocs
          </span>
        </div>

        {/* Center — editable title */}
        <h1
          contentEditable
          suppressContentEditableWarning
          onInput={handleTitleInput}
          data-placeholder="Untitled Document"
          className="flex-1 min-w-0 text-center text-base font-headline font-bold text-on-surface outline-none focus:ring-0 truncate px-2 empty:before:content-[attr(data-placeholder)] empty:before:text-outline/40"
        >
          {title}
        </h1>

        {/* Right */}
        <div className="flex items-center gap-2 flex-shrink-0">
          <PresenceAvatars collaborators={collaborators} maxVisible={3} size="sm" />
          <div className="h-6 w-[1px] bg-outline-variant/20 mx-1" />
          <button
            onClick={() => setShowHistory(true)}
            className="p-2 rounded-lg hover:bg-surface-container-high transition-colors"
            title="Version history"
          >
            <span className="material-symbols-outlined text-on-surface-variant text-[20px]">history</span>
          </button>
          <button className="hidden sm:flex px-3 py-1.5 text-sm text-on-primary-container font-semibold hover:bg-surface-container-high transition-colors rounded-lg">
            Collaborate
          </button>
          <button className="px-3 py-1.5 text-sm bg-primary text-on-primary font-semibold rounded-lg shadow-sm hover:opacity-90 transition-all">
            Share
          </button>
        </div>
      </header>

      {/* ── Body ─────────────────────────────────────────────────────────── */}
      <div className="flex flex-1 overflow-hidden">

        {/* Sidebar */}
        {sidebarOpen && (
          <aside className="flex-shrink-0 border-r border-outline-variant/10 overflow-hidden">
            <DocumentList
              activeDocId={docId}
              onSelect={handleDocSelect}
              onNewDoc={handleNewDoc}
            />
          </aside>
        )}

        {/* Editor column */}
        <div className="flex-1 flex flex-col overflow-hidden">

          <Toolbar
            disabled={!connected}
            onFormat={handleContentChange}
          />

          <div className="flex-1 overflow-y-auto">
            <div className="max-w-4xl mx-auto py-16 px-6">

              {/* Presence strip */}
              <div className="flex items-center gap-4 mb-8 pb-6 border-b border-outline-variant/10">
                <PresenceAvatars collaborators={collaborators} maxVisible={5} />
                <span className="text-on-surface-variant text-sm font-medium">
                  {connected ? "Live" : "Offline"} · rev {revision}
                </span>
              </div>

              {/* ── EditorCore: the ONLY place useOT is called ───────────── */}
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
              />
            </div>
          </div>

          <StatusBar
            saveStatus={saveStatus}
            connected={connected}
            onlineCount={onlineCount}
          />
        </div>
      </div>

      {/* ── Floating quick-format bar ─────────────────────────────────────── */}
      <div className="fixed bottom-8 left-1/2 -translate-x-1/2 bg-white/90 backdrop-blur-md px-5 py-2.5 rounded-full shadow-[0_20px_50px_rgba(25,49,93,0.1)] flex items-center gap-3 border border-outline-variant/10 z-30">
        {[
          { icon: "format_bold",   cmd: "bold",   label: "Bold"   },
          { icon: "format_italic", cmd: "italic", label: "Italic" },
        ].map(({ icon, cmd, label }) => (
          <button
            key={cmd}
            title={label}
            onClick={() => { document.execCommand(cmd, false, null); handleContentChange(); }}
            className="flex flex-col items-center gap-0.5 group"
          >
            <span className="material-symbols-outlined text-on-surface-variant group-hover:text-primary transition-colors text-[18px]">{icon}</span>
            <span className="text-[9px] font-bold text-on-surface-variant uppercase tracking-wide">{label}</span>
          </button>
        ))}
        <div className="h-5 w-[1px] bg-outline-variant/20" />
        <button
          title="Add link"
          onClick={() => {
            const url = window.prompt("Enter URL:");
            if (url) document.execCommand("createLink", false, url);
          }}
          className="flex flex-col items-center gap-0.5 group"
        >
          <span className="material-symbols-outlined text-on-surface-variant group-hover:text-primary transition-colors text-[18px]">add_link</span>
          <span className="text-[9px] font-bold text-on-surface-variant uppercase tracking-wide">Link</span>
        </button>
        <div className="h-5 w-[1px] bg-outline-variant/20" />
        <button className="px-3 py-1 bg-primary text-on-primary text-xs font-bold rounded-full hover:opacity-90 transition-all">
          Publish
        </button>
      </div>

      {/* ── Version history panel ─────────────────────────────────────────── */}
      <VersionHistoryPanel
        isOpen={showHistory}
        onClose={() => setShowHistory(false)}
        docId={docId}
        onRestore={handleRestore}
      />
    </div>
  );
}
