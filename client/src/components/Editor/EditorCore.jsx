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
    // Accepted for API compatibility but unused: connection state is rendered
    // by EditorPage's status bar, not here.
    connected: _connected,
    currentUser,
    initialContent = "",
    onContentChange,
    onCollaboratorsChange,
    onRevisionChange,
    onSaveStateChange,
    onResync,
    // A viewer's edits are rejected by the server anyway; making the surface
    // genuinely uneditable means they never type into a void.
    readOnly = false,
    className = ""
  },
  ref
) {
  const editorRef = useRef(null);

  // ── OT engine — ONE instance only ────────────────────────────────────────
  const {
    handleEditorInput, replaceSelection, normalizeIfStructured,
    seed, content, revision, loaded, saveState,
  } = useOT({
    socket,
    docId,
    editorRef,
    onResync,
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

  // ── Notify parent of save state ──────────────────────────────────────────
  // Driven by op:ack, so "Saved" means the server acknowledged every local
  // edit — not that a timer elapsed.
  useEffect(() => {
    onSaveStateChange?.(saveState);
  }, [saveState, onSaveStateChange]);

  // ── Notify parent of content changes (for autosave debounce) ─────────────
  useEffect(() => {
    onContentChange?.(content);
  }, [content, onContentChange]);

  // ── Optimistic first paint from the REST fetch ───────────────────────────
  // This used to be a mount-once effect with an empty dependency array reading
  // `initialContent`. That was harmless only because initialContent was always
  // "" (activeDocument was never populated); now that it carries a real value
  // arriving asynchronously, the stale closure would paint nothing.
  //
  // Depending on it properly is safe because seed() is idempotent and refuses
  // to run once doc:load has arrived or the user has typed — the socket stays
  // authoritative. It also writes through useOT, so prevContentRef tracks the
  // DOM; writing textContent directly here left the diff baseline stale and
  // turned the next keystroke into a whole-document replacement.
  useEffect(() => {
    seed(initialContent);
  }, [seed, initialContent]);

  // ── Expose imperative API to parent ──────────────────────────────────────
  useImperativeHandle(ref, () => ({
    getContent:  () => editorRef.current?.textContent ?? "",
    getRevision: () => revision,
    isLoaded:    () => loaded,
    focus:       () => editorRef.current?.focus(),
    getEditorEl: () => editorRef.current,
  }), [revision, loaded]);

  // ── Plain-text input policy ───────────────────────────────────────────────
  //
  // The document is a flat string and the sync engine reads it with
  // textContent. Anything the browser does to the DOM that textContent cannot
  // see is invisible to the diff, produces no operation, and is wiped the
  // moment a remote op rewrites the element — which is how two clients ended up
  // showing the same 64 characters as three lines and one line.
  //
  // So every native path that builds structure instead of characters is
  // intercepted here and turned into ordinary text.
  const isComposingRef = useRef(false);

  useEffect(() => {
    const el = editorRef.current;
    if (!el || readOnly) return undefined;

    // beforeinput reports WHAT the browser is about to do, before it does it.
    const onBeforeInput = (e) => {
      switch (e.inputType) {
        // Enter and Shift+Enter. The browser would insert a <div> or a <br>;
        // neither shows up in textContent, so the typist sees a line break that
        // never reaches anyone else.
        case "insertParagraph":
        case "insertLineBreak":
          e.preventDefault();
          replaceSelection("\n");
          break;

        // Cmd/Ctrl+B, I, U still apply native formatting in a contentEditable
        // even with the toolbar gone (Phase 6). The markup would be invisible
        // to the diff and destroyed on the next remote op, so refuse it.
        case "formatBold":
        case "formatItalic":
        case "formatUnderline":
        case "formatStrikeThrough":
        case "formatSuperscript":
        case "formatSubscript":
        case "formatJustifyFull":
        case "formatJustifyCenter":
        case "formatJustifyLeft":
        case "formatJustifyRight":
        case "formatIndent":
        case "formatOutdent":
        case "insertOrderedList":
        case "insertUnorderedList":
        case "insertHorizontalRule":
          e.preventDefault();
          break;

        // The browser's undo stack is a DOM history, and it has no idea that
        // other people have edited this document since. Replaying it would
        // reinstate structure and fight OT. Refused deliberately; a real
        // collaborative undo is per-author and belongs in the OT layer.
        case "historyUndo":
        case "historyRedo":
          e.preventDefault();
          break;

        default:
          break;
      }
    };

    // Paste and drop carry HTML. Take the plain-text flavour only; multi-line
    // text arrives as "\n" characters and generates real ops.
    const onPaste = (e) => {
      e.preventDefault();
      const text = e.clipboardData?.getData("text/plain") ?? "";
      if (text) replaceSelection(text.replace(/\r\n?/g, "\n"));
    };

    const onDrop = (e) => {
      e.preventDefault();
      const text = e.dataTransfer?.getData("text/plain") ?? "";
      if (text) replaceSelection(text.replace(/\r\n?/g, "\n"));
    };

    // IME composition (CJK, accents, mobile autocorrect) mutates the DOM in
    // intermediate states. Diffing mid-composition emits ops for text the user
    // has not committed; wait for compositionend.
    const onCompositionStart = () => { isComposingRef.current = true; };
    const onCompositionEnd = () => {
      isComposingRef.current = false;
      normalizeIfStructured();
      handleEditorInput();
    };

    el.addEventListener("beforeinput", onBeforeInput);
    el.addEventListener("paste", onPaste);
    el.addEventListener("drop", onDrop);
    el.addEventListener("compositionstart", onCompositionStart);
    el.addEventListener("compositionend", onCompositionEnd);
    return () => {
      el.removeEventListener("beforeinput", onBeforeInput);
      el.removeEventListener("paste", onPaste);
      el.removeEventListener("drop", onDrop);
      el.removeEventListener("compositionstart", onCompositionStart);
      el.removeEventListener("compositionend", onCompositionEnd);
    };
  }, [readOnly, replaceSelection, normalizeIfStructured, handleEditorInput]);

  const handleInput = useCallback(() => {
    if (isComposingRef.current) return; // mid-IME: not committed text yet
    // Backstop: if anything still managed to put elements in the editor, flatten
    // them before diffing. normalizeIfStructured re-diffs itself when it acts.
    if (!normalizeIfStructured()) handleEditorInput();
    broadcastCursor();
  }, [handleEditorInput, normalizeIfStructured, broadcastCursor]);

  const handleKeyUp   = useCallback(() => broadcastCursor(), [broadcastCursor]);
  const handleMouseUp = useCallback(() => broadcastCursor(), [broadcastCursor]);

  return (
    <div className="relative">
      {/* Remote user cursors */}
      <CursorOverlay collaborators={collaborators} />

      {/* Editable surface */}
      <div
        ref={editorRef}
        contentEditable={!readOnly}
        suppressContentEditableWarning
        spellCheck={!readOnly}
        aria-readonly={readOnly}
        data-placeholder={readOnly ? "" : "Start writing…"}
        onInput={readOnly ? undefined : handleInput}
        onKeyUp={readOnly ? undefined : handleKeyUp}
        onMouseUp={handleMouseUp}
        // white-space is set inline, not left to the Tailwind class. The
        // utility does currently win, but only because EditorPage's runtime
        // <style> block happens not to set white-space — and that block is
        // injected after the bundle, so it would silently override it. A
        // document whose line breaks are "\n" cannot afford that to be luck.
        style={{ whiteSpace: "pre-wrap", overflowWrap: "break-word", ...(readOnly ? { cursor: "default" } : null) }}
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
