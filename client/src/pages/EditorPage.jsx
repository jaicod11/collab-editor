import { useState, useRef, useCallback, useEffect, useMemo } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useSocket } from "../hooks/useSocket";
import { useDocument } from "../hooks/useDocument";
import { useToast } from "../components/UI/Toast";
import { useAuthStore } from "../store/authSlice";
import { useDocumentStore } from "../store/documentSlice";
import EditorCore from "../components/Editor/EditorCore";
import ShareModal from "../components/Editor/ShareModal";
import api from "../services/api";

const E = {
  bg: "#1a1a1a", fg: "#e8e8e8", border: "#2e2e2e",
  primary: "#3ddc6e", primFg: "#0f1a13", muted: "#2a2a2a",
  mutedFg: "#7a7a7a", surface: "#222222", sidebar: "#161616",
  font: "'Geist','DM Sans',sans-serif",
};

function initials(n) {
  if (!n) return "?";
  return n.split(" ").map(x => x[0]).join("").toUpperCase().slice(0, 2);
}

function fmtTime(d) {
  if (!d) return "";
  const dt = new Date(d), diff = Date.now() - dt;
  if (diff < 60000) return "Just now";
  if (diff < 3600000) return `${Math.round(diff / 60000)}m ago`;
  if (diff < 86400000) return dt.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
  return dt.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });
}

function groupByDate(items) {
  const groups = {}, now = Date.now();
  items.forEach(a => {
    const diff = now - new Date(a.appliedAt ?? a.createdAt ?? now);
    const label = diff < 86400000 ? "Today" : diff < 172800000 ? "Yesterday"
      : new Date(a.appliedAt).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" }).toUpperCase();
    if (!groups[label]) groups[label] = [];
    groups[label].push(a);
  });
  return groups;
}

function Avatar({ name, size = 24, dot = false }) {
  const cols = ["#3ddc6e", "#3b82f6", "#f59e0b", "#e05c2a", "#8b2ae0"];
  const bg = cols[(name?.charCodeAt(0) ?? 0) % cols.length];
  return (
    <div style={{ position: "relative", flexShrink: 0 }}>
      <div style={{ width: size, height: size, borderRadius: "50%", background: bg, display: "flex", alignItems: "center", justifyContent: "center", fontSize: size * 0.38, fontWeight: 700, color: "#fff" }}>
        {initials(name)}
      </div>
      {dot && <div style={{ position: "absolute", bottom: 0, right: 0, width: size * 0.35, height: size * 0.35, borderRadius: "50%", background: E.primary, border: `1.5px solid ${E.sidebar}` }} />}
    </div>
  );
}

function VersionPanel({ docId, collaborators, currentUser, connected, onClose }) {
  const [history, setHistory] = useState([]);
  const [state, setState] = useState("loading"); // loading | ready | error

  useEffect(() => {
    if (!docId) return;
    setState("loading");
    api.get(`/history/${docId}`)
      .then(({ data }) => {
        setHistory(Array.isArray(data.history) ? data.history : []);
        setState("ready");
      })
      // Failures used to be swallowed by `.catch(() => {})` and then papered
      // over with fabricated entries, so a broken endpoint looked like a
      // populated audit trail. Surface it instead.
      .catch(() => setState("error"));
  }, [docId]);

  const grouped = useMemo(
    () => (history.length > 0 ? groupByDate(history) : {}),
    [history]
  );

  // Who is genuinely in this document right now: the collaborators presence
  // reports, plus ourselves only while the socket is actually connected. This
  // used to list the current user as "Editing" unconditionally, even offline.
  const onlineNow = [
    ...(connected ? [{ userId: currentUser?.id, name: currentUser?.name ?? "You", self: true }] : []),
    ...collaborators,
  ].slice(0, 5);

  return (
    <aside style={{ width: 280, background: E.sidebar, borderLeft: `1px solid ${E.border}`, display: "flex", flexDirection: "column", flexShrink: 0, overflowY: "auto" }}>
      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "11px 14px", borderBottom: `1px solid ${E.border}`, flexShrink: 0 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 7 }}>
          <div style={{ width: 20, height: 20, background: E.primary, borderRadius: 4, display: "flex", alignItems: "center", justifyContent: "center" }}>
            <svg xmlns="http://www.w3.org/2000/svg" width="11" height="11" viewBox="0 0 24 24" fill="none" stroke={E.primFg} strokeWidth="2.8"><path d="M12.659 22H18a2 2 0 0 0 2-2V8l-6-6H6a2 2 0 0 0-2 2v9.34" /><path d="M14 2v5a1 1 0 0 0 1 1h5" /></svg>
          </div>
          <span style={{ fontSize: 13, fontWeight: 600, color: E.fg }}>Version History</span>
        </div>
        <button onClick={onClose}
          style={{ background: "none", border: "none", color: E.mutedFg, cursor: "pointer", padding: 3, borderRadius: 4, display: "flex" }}
          onMouseEnter={e => e.currentTarget.style.color = E.fg} onMouseLeave={e => e.currentTarget.style.color = E.mutedFg}>
          <svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6"><path d="M18 6 6 18M6 6l12 12" /></svg>
        </button>
      </div>

      {/* Online now */}
      <div style={{ padding: "10px 14px", borderBottom: `1px solid ${E.border}`, flexShrink: 0 }}>
        <p style={{ fontSize: 10, fontWeight: 600, color: E.mutedFg, textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: 8 }}>Online now</p>
        {onlineNow.length === 0 ? (
          <p style={{ fontSize: 12, color: E.mutedFg }}>Not connected</p>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 7 }}>
            {onlineNow.map((c, i) => (
              <div key={c.userId ?? i} style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <Avatar name={c.name} size={24} dot />
                <span style={{ fontSize: 12, color: E.fg, flex: 1 }}>
                  {c.name}{c.self ? " (you)" : ""}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Activity timeline — real entries only */}
      <div style={{ flex: 1, overflowY: "auto", padding: "6px 0" }}>
        {state === "loading" && (
          <p style={{ fontSize: 12, color: E.mutedFg, padding: "16px 14px" }}>Loading history…</p>
        )}

        {state === "error" && (
          <div style={{ padding: "16px 14px" }}>
            <p style={{ fontSize: 12, color: "#ef4444", marginBottom: 4 }}>Could not load version history.</p>
            <p style={{ fontSize: 11, color: E.mutedFg, lineHeight: 1.5 }}>
              The edit log is unavailable right now. Nothing has been lost — try reopening this panel.
            </p>
          </div>
        )}

        {state === "ready" && history.length === 0 && (
          <div style={{ padding: "16px 14px" }}>
            <p style={{ fontSize: 12, color: E.fg, marginBottom: 4 }}>No edits yet</p>
            <p style={{ fontSize: 11, color: E.mutedFg, lineHeight: 1.5 }}>
              Changes to this document will appear here as they happen.
            </p>
          </div>
        )}

        {state === "ready" && Object.entries(grouped).map(([label, entries]) => (
          <div key={label} style={{ marginBottom: 2 }}>
            <p style={{ fontSize: 10, fontWeight: 600, color: E.mutedFg, textTransform: "uppercase", letterSpacing: "0.1em", padding: "8px 14px 3px" }}>{label}</p>
            {entries.map(entry => (
              <div key={entry.id}
                style={{ display: "flex", alignItems: "flex-start", gap: 8, padding: "6px 14px", transition: "background .1s", cursor: "default" }}
                onMouseEnter={e => e.currentTarget.style.background = "rgba(255,255,255,.03)"}
                onMouseLeave={e => e.currentTarget.style.background = "none"}>
                <Avatar name={entry.author?.name} size={22} dot />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 5, flexWrap: "wrap" }}>
                    <span style={{ fontSize: 12, fontWeight: 500, color: E.fg }}>{entry.author?.name ?? "Unknown"}</span>
                    <span style={{ fontSize: 10, color: E.mutedFg }}>{fmtTime(entry.appliedAt)}</span>
                  </div>
                  <p style={{ fontSize: 11, color: E.mutedFg, marginTop: 1, lineHeight: 1.4 }}>{entry.description}</p>
                </div>
              </div>
            ))}
          </div>
        ))}
      </div>
    </aside>
  );
}

export default function EditorPage() {
  const { docId } = useParams();
  const navigate = useNavigate();
  const { toast } = useToast();
  const currentUser = useAuthStore(s => s.user);

  const [title, setTitle] = useState("Untitled Document");
  const [editingTitle, setEditingTitle] = useState(false);
  const [saveStatus, setSaveStatus] = useState("Saved");
  const [showHistory, setShowHistory] = useState(true);
  const [showShare, setShowShare] = useState(false);
  // The viewer's own role, reported by doc:load. Drives the read-only banner;
  // the server enforces it independently on every write.
  const [myRole, setMyRole] = useState(null);
  const isViewer = myRole === "viewer";
  const [collaborators, setCollaborators] = useState([]);
  const [wordCount, setWordCount] = useState(0);
  const [charCount, setCharCount] = useState(0);
  // Tracked so EditorCore has somewhere to report to; not rendered anywhere yet.
  const [, setRevision] = useState(0);

  const editorCoreRef = useRef(null);
  const titleTimer = useRef(null);

  const { socket, connected } = useSocket(docId);
  const { updateTitle, createDoc } = useDocument();

  // activeDocument lives in the store; nothing used to populate it, so this
  // page rendered a blank editor until the socket round trip completed and
  // never recovered if doc:load was missed.
  const activeDocument = useDocumentStore((s) => s.activeDocument);
  const setActiveDocument = useDocumentStore((s) => s.setActiveDocument);
  const clearActiveDocument = useDocumentStore((s) => s.clearActiveDocument);
  const updateActiveContent = useDocumentStore((s) => s.updateActiveContent);
  const updateActiveTitle = useDocumentStore((s) => s.updateActiveTitle);

  // The toast helper is rebuilt on every ToastProvider render, so keep it out
  // of effect dependency lists — otherwise showing any toast anywhere tears
  // down and re-registers this page's socket listeners.
  const toastRef = useRef(toast);
  toastRef.current = toast;
  const navigateRef = useRef(navigate);
  navigateRef.current = navigate;

  // ── Fetch the document ────────────────────────────────────────────────────
  //
  // AUTHORITY: this REST read supplies metadata (title, owner, status) and an
  // immediate first paint. The socket's doc:load is authoritative for content
  // and revision — the OT engine must be anchored to the revision the server
  // actually joined us at, and useOT.seed() ignores this content once doc:load
  // has landed. So the two are not racing; they own different fields.
  useEffect(() => {
    if (!docId) return undefined;
    let cancelled = false;

    api.get(`/documents/${docId}`)
      .then(({ data }) => { if (!cancelled) setActiveDocument(data); })
      .catch((err) => {
        if (cancelled) return;
        toastRef.current.error(
          err.response?.status === 403 ? "You do not have access to this document"
            : err.response?.status === 404 ? "Document not found"
            : "Failed to load document"
        );
      });

    return () => { cancelled = true; clearActiveDocument(); };
  }, [docId, setActiveDocument, clearActiveDocument]);

  // Title follows the store. Depending on the string rather than the object
  // means an unrelated content update does not clobber an in-progress rename.
  useEffect(() => {
    if (activeDocument?.title) setTitle(activeDocument.title);
  }, [activeDocument?.title]);

  useEffect(() => {
    if (!socket) return undefined;
    const onLoad = ({ title: t, content, revision, role }) => {
      if (t) setTitle(t);
      if (role) setMyRole(role);
      // Fold the authoritative socket state back into the store so anything
      // else reading activeDocument sees what the editor is actually showing.
      if (t) updateActiveTitle(t);
      updateActiveContent(content ?? "", revision ?? 0);
    };
    const onErr = ({ code, message }) => {
      toastRef.current.error(message);
      // The owner removed us or dropped us to view-only while we had the
      // document open. The socket has already been forced out of the room.
      if (code === "ACCESS_REVOKED") navigateRef.current("/documents", { replace: true });
      if (code === "VIEWER_READONLY") setMyRole("viewer");
    };

    socket.on("doc:load", onLoad);
    socket.on("doc:error", onErr);
    return () => { socket.off("doc:load", onLoad); socket.off("doc:error", onErr); };
  }, [socket, updateActiveTitle, updateActiveContent]);

  const handleContentChange = useCallback((content) => {
    const text = content ?? "";
    setWordCount(text.trim().split(/\s+/).filter(Boolean).length);
    setCharCount(text.length);
  }, []);

  // Driven by op:ack rather than a 1.5s timer, so "Saved" means the server
  // acknowledged every local edit instead of merely that time passed.
  const handleSaveStateChange = useCallback((state) => {
    setSaveStatus(state === "saving" ? "Saving…" : "Saved");
  }, []);

  // The resync in useOT discards un-acked local edits. Say so, rather than
  // letting the text change under the user with no explanation.
  const handleResync = useCallback(() => {
    toastRef.current.warning(
      "Reconnected to the document — anything typed in the last moment may not have been saved."
    );
    // Put focus back where the user was working.
    editorCoreRef.current?.focus?.();
  }, []);

  const handleTitleChange = useCallback((val) => {
    setTitle(val);
    clearTimeout(titleTimer.current);
    titleTimer.current = setTimeout(async () => {
      if (docId && val.trim()) { try { await updateTitle(docId, val.trim()); } catch { toast.error("Failed to save title"); } }
    }, 800);
  }, [docId, updateTitle, toast]);

  const handleNewDoc = useCallback(async () => {
    const doc = await createDoc("Untitled Document");
    if (doc) navigate(`/editor/${doc._id ?? doc.id}`);
  }, [createDoc, navigate]);

  useEffect(() => () => { clearTimeout(titleTimer.current); }, []);

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100vh", background: E.bg, fontFamily: E.font, color: E.fg, overflow: "hidden" }}>

      {/* NAVBAR */}
      <header style={{ display: "flex", alignItems: "center", gap: 10, padding: "0 14px", height: 48, background: E.sidebar, borderBottom: `1px solid ${E.border}`, flexShrink: 0, zIndex: 40 }}>
        <div style={{ width: 28, height: 28, background: E.primary, borderRadius: 7, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, cursor: "pointer" }} onClick={() => navigate("/")}>
          <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={E.primFg} strokeWidth="2.8" strokeLinecap="round" strokeLinejoin="round">
            <path d="M12.659 22H18a2 2 0 0 0 2-2V8l-6-6H6a2 2 0 0 0-2 2v9.34" />
            <path d="M14 2v5a1 1 0 0 0 1 1h5m-9.622 4.622a1 1 0 0 1 3 3.003L8.36 20.637a2 2 0 0 1-.854.506l-2.867.837a.5.5 0 0 1-.62-.62l.836-2.869a2 2 0 0 1 .506-.853z" />
          </svg>
        </div>

        {/* Title */}
        <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
          {editingTitle ? (
            <input value={title} onChange={e => handleTitleChange(e.target.value)}
              onBlur={() => setEditingTitle(false)} onKeyDown={e => e.key === "Enter" && setEditingTitle(false)}
              style={{ background: E.muted, border: `1px solid ${E.primary}`, borderRadius: 5, color: E.fg, fontSize: 13, fontWeight: 600, padding: "2px 8px", outline: "none", fontFamily: E.font, width: 200 }}
              autoFocus />
          ) : (
            <span style={{ fontSize: 13, fontWeight: 600, color: E.fg, cursor: isViewer ? "default" : "text" }}
              onClick={() => { if (!isViewer) setEditingTitle(true); }}>{title}</span>
          )}
          {!isViewer && <button onClick={() => setEditingTitle(true)}
            style={{ background: "none", border: "none", color: E.mutedFg, cursor: "pointer", padding: 2, borderRadius: 3, display: "flex" }}
            onMouseEnter={e => e.currentTarget.style.color = E.fg} onMouseLeave={e => e.currentTarget.style.color = E.mutedFg}>
            <span className="material-symbols-outlined" style={{ fontSize: 14 }}>edit</span>
          </button>}
        </div>


        <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 8 }}>
          {/* Save status */}
          <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
            <span className="material-symbols-outlined" style={{ fontSize: 14, color: saveStatus === "Saved" ? E.primary : E.mutedFg }}>{saveStatus === "Saved" ? "cloud_done" : "sync"}</span>
            <span style={{ fontSize: 12, color: E.mutedFg }}>{saveStatus}</span>
          </div>

          <div style={{ width: 1, height: 16, background: E.border }} />

          {/* + New Document */}
          <button onClick={handleNewDoc}
            style={{ display: "flex", alignItems: "center", gap: 5, padding: "4px 10px", background: "none", border: `1px solid ${E.border}`, borderRadius: 5, color: E.fg, fontSize: 12, fontWeight: 500, cursor: "pointer", fontFamily: E.font, transition: "all .15s" }}
            onMouseEnter={e => { e.currentTarget.style.borderColor = E.primary; e.currentTarget.style.color = E.primary; }}
            onMouseLeave={e => { e.currentTarget.style.borderColor = E.border; e.currentTarget.style.color = E.fg; }}>
            <span className="material-symbols-outlined" style={{ fontSize: 13 }}>add</span>
            New Document
          </button>

          {/* Collaborator avatars */}
          {collaborators.length > 0 && (
            <div style={{ display: "flex", flexDirection: "row-reverse" }}>
              {collaborators.slice(0, 3).map((c, i) => (
                <div key={c.userId ?? i} style={{ marginLeft: i > 0 ? -7 : 0, border: `2px solid ${E.sidebar}`, borderRadius: "50%" }}>
                  <Avatar name={c.name} size={26} dot />
                </div>
              ))}
            </div>
          )}

          {/* Share */}
          <button onClick={() => setShowShare(true)}
            style={{ display: "flex", alignItems: "center", gap: 5, padding: "5px 13px", background: E.primary, border: "none", borderRadius: 6, color: E.primFg, fontSize: 12, fontWeight: 600, cursor: "pointer", fontFamily: E.font }}
            onMouseEnter={e => e.currentTarget.style.opacity = ".88"} onMouseLeave={e => e.currentTarget.style.opacity = "1"}>
            <span className="material-symbols-outlined" style={{ fontSize: 14, fontVariationSettings: "'FILL' 1" }}>group_add</span>
            Share
          </button>

          {/* History toggle */}
          <button onClick={() => setShowHistory(o => !o)}
            style={{ padding: 5, background: showHistory ? E.muted : "none", border: "none", borderRadius: 5, color: showHistory ? E.fg : E.mutedFg, cursor: "pointer", display: "flex", transition: "all .15s" }}
            onMouseEnter={e => { if (!showHistory) { e.currentTarget.style.background = "rgba(255,255,255,.06)"; e.currentTarget.style.color = E.fg; } }}
            onMouseLeave={e => { if (!showHistory) { e.currentTarget.style.background = "none"; e.currentTarget.style.color = E.mutedFg; } }}>
            <span className="material-symbols-outlined" style={{ fontSize: 17 }}>history</span>
          </button>

          <Avatar name={currentUser?.name} size={28} dot />
        </div>
      </header>

      {isViewer && (
        <div style={{
          display: "flex", alignItems: "center", gap: 8, padding: "8px 16px",
          background: "rgba(245,158,11,.1)", borderBottom: "1px solid rgba(245,158,11,.25)",
          color: "#f59e0b", fontSize: 12, flexShrink: 0,
        }}>
          <span className="material-symbols-outlined" style={{ fontSize: 15 }}>visibility</span>
          <span>
            <strong>View only.</strong> You can read this document and see live changes,
            but not edit it. Ask the owner for edit access.
          </span>
        </div>
      )}

      {/* BODY */}
      <div style={{ display: "flex", flex: 1, overflow: "hidden" }}>
        {/* Canvas */}
        <div style={{ flex: 1, overflowY: "auto", display: "flex", justifyContent: "center", padding: "40px 24px", background: E.bg }}>
          <div style={{ width: "100%", maxWidth: 752, background: E.muted, borderRadius: 3, minHeight: "calc(100vh - 190px)", padding: "56px 64px" }}>
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
              onSaveStateChange={handleSaveStateChange}
              onResync={handleResync}
              readOnly={isViewer}
              className="editor-canvas-new"
            />
          </div>
        </div>

        {/* History panel */}
        {showHistory && (
          <VersionPanel
            docId={docId}
            collaborators={collaborators}
            currentUser={currentUser}
            connected={connected}
            onClose={() => setShowHistory(false)}
          />
        )}
      </div>

      {/* STATUS BAR */}
      <footer style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "0 16px", height: 30, background: E.sidebar, borderTop: `1px solid ${E.border}`, flexShrink: 0 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <span style={{ fontSize: 11, color: E.mutedFg }}>{wordCount} word{wordCount !== 1 ? "s" : ""}</span>
          <span style={{ color: E.border }}>|</span>
          <span style={{ fontSize: 11, color: E.mutedFg }}>{charCount} character{charCount !== 1 ? "s" : ""}</span>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          {myRole === "viewer" && (
            <>
              <span style={{ fontSize: 11, color: "#f59e0b", fontWeight: 600 }}>View only</span>
              <span style={{ color: E.border }}>|</span>
            </>
          )}
          <span style={{ fontSize: 11, color: E.mutedFg }}>No workspace</span>
          <span style={{ color: E.border }}>|</span>
          <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
            <div style={{ width: 6, height: 6, borderRadius: "50%", background: connected ? E.primary : "#ef4444" }} />
            <span style={{ fontSize: 11, color: E.mutedFg }}>{connected ? "Editing" : "Offline"}</span>
          </div>
        </div>
      </footer>

      {showShare && (
        <ShareModal docId={docId} currentUser={currentUser} onClose={() => setShowShare(false)} />
      )}

      <style>{`
        .editor-canvas-new {
          font-family:${E.font}; font-size:16px; line-height:1.8;
          color:${E.fg}; min-height:60vh; outline:none;
        }
        .editor-canvas-new:empty::before {
          content:"Untitled"; color:rgba(232,232,232,0.12);
          font-size:38px; font-weight:700; pointer-events:none;
        }
        input::placeholder{color:${E.mutedFg};}
      `}</style>
    </div>
  );
}