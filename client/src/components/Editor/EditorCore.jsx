/**
 * components/Editor/EditorCore.jsx
 * ─────────────────────────────────────────────────────────────────────────────
 * The SINGLE place where useOT and usePresence are called.
 * EditorPage must NOT call these hooks — that was causing double-application
 * of every op (palindrome / garbled text bug).
 *
 * Data flows OUT via props callbacks:
 *   onCollaboratorsChange(collaborators)
 *   onRevisionChange(revision)
 *   onConnectedChange(connected)
 *
 * Props:
 *   docId                  {string}
 *   socket                 {Socket}   — from useSocket() in EditorPage
 *   connected              {bool}     — from useSocket() in EditorPage
 *   currentUser            {object}   — { id, name }
 *   initialContent         {string}
 *   onContentChange        {fn}       — called when content changes (for autosave)
 *   onCollaboratorsChange  {fn}       — called with collaborators array
 *   onRevisionChange       {fn}       — called with revision number
 *   className              {string}
 */

import {
  useRef,
  useEffect,
  useCallback,
  forwardRef,
  useImperativeHandle,
} from "react";
import { useOT }       from "../../hooks/useOT";
import { usePresence } from "../../hooks/usePresence";
import CursorOverlay   from "./CursorOverlay";

const EditorCore = forwardRef(function EditorCore(
  {
    docId,
    socket,
    connected,
    currentUser,
    initialContent = "",
    onContentChange,
    onCollaboratorsChange,
    onRevisionChange,
    className = "",
  },
  ref
) {
  const editorRef = useRef(null);

  // ── OT engine — ONE instance only ────────────────────────────────────────
  const { handleEditorInput, content, revision } = useOT({
    socket,
    docId,
    editorRef,
  });

  // ── Presence / cursors ────────────────────────────────────────────────────
  const { collaborators, broadcastCursor } = usePresence({
    socket,
    docId,
    editorRef,
    currentUser,
  });

  // ── Notify parent of collaborator changes ─────────────────────────────────
  useEffect(() => {
    onCollaboratorsChange?.(collaborators);
  }, [collaborators, onCollaboratorsChange]);

  // ── Notify parent of revision changes ────────────────────────────────────
  useEffect(() => {
    onRevisionChange?.(revision);
  }, [revision, onRevisionChange]);

  // ── Notify parent of content changes (for autosave debounce) ─────────────
  useEffect(() => {
    onContentChange?.(content);
  }, [content, onContentChange]);

  // ── Set initial content once on mount ────────────────────────────────────
  useEffect(() => {
    if (editorRef.current && initialContent && !editorRef.current.textContent) {
      editorRef.current.textContent = initialContent;
    }
  }, []); // intentionally empty — run once only

  // ── Expose imperative API to parent ──────────────────────────────────────
  useImperativeHandle(ref, () => ({
    getContent:  () => editorRef.current?.textContent ?? "",
    getRevision: () => revision,
    focus:       () => editorRef.current?.focus(),
    getEditorEl: () => editorRef.current,
  }));

  const handleInput = useCallback(() => {
    handleEditorInput();
    broadcastCursor();
  }, [handleEditorInput, broadcastCursor]);

  const handleKeyUp   = useCallback(() => broadcastCursor(), [broadcastCursor]);
  const handleMouseUp = useCallback(() => broadcastCursor(), [broadcastCursor]);

  return (
    <div className="relative">
      {/* Remote user cursors */}
      <CursorOverlay collaborators={collaborators} />

      {/* Editable surface */}
      <div
        ref={editorRef}
        contentEditable
        suppressContentEditableWarning
        spellCheck
        data-placeholder="Start writing…"
        onInput={handleInput}
        onKeyUp={handleKeyUp}
        onMouseUp={handleMouseUp}
        className={`
          min-h-[60vh] text-on-surface leading-relaxed text-lg outline-none
          focus:ring-0 whitespace-pre-wrap break-words
          [&_h1]:font-headline [&_h1]:text-4xl [&_h1]:font-bold [&_h1]:mt-8 [&_h1]:mb-4
          [&_h2]:font-headline [&_h2]:text-3xl [&_h2]:font-bold [&_h2]:mt-6 [&_h2]:mb-3
          [&_h3]:font-headline [&_h3]:text-2xl [&_h3]:font-bold [&_h3]:mt-4 [&_h3]:mb-2
          [&_ul]:list-disc  [&_ul]:ml-6 [&_ul]:my-2
          [&_ol]:list-decimal [&_ol]:ml-6 [&_ol]:my-2
          ${className}
        `}
      />
    </div>
  );
});

export default EditorCore;
