/**
 * hooks/useOT.js
 * ─────────────────────────────────────────────────────────────────────────────
 * Client-side Operational Transformation engine.
 *
 *  - isApplyingRemote mutex blocks handleEditorInput while a remote op is being
 *    written to the DOM, preventing the feedback loop that garbled text.
 *  - textContent, not innerText — no layout-dependent newlines.
 *  - prevContentRef is updated before every DOM write.
 *  - The caret is preserved across remote ops and resyncs (see readCaretOffset).
 *  - Pending/buffer bookkeeping lives in shared/ot/client-sync.js.
 */

import { useEffect, useRef, useCallback, useState } from "react";
import { applyOp, isNoop, flatten } from "../lib/ot/operations";
import {
  createSyncState, applyLocal, receiveAck, receiveRemote,
} from "@shared/ot/client-sync.js";

/**
 * Per-tab site id — the deterministic tie-break for two inserts at the same
 * position. It is NOT the userId: one person with two tabs open is two
 * genuinely concurrent replicas, and a shared userId would tie forever,
 * leaving the order dependent on argument order again.
 *
 * sessionStorage is per-tab and survives a reload, which is exactly the
 * lifetime we want.
 */
const SITE_ID = (() => {
  const KEY = "collab-ot-site-id";
  try {
    let id = window.sessionStorage.getItem(KEY);
    if (!id) {
      id = window.crypto?.randomUUID?.() ?? `s-${Date.now()}-${Math.random().toString(36).slice(2)}`;
      window.sessionStorage.setItem(KEY, id);
    }
    return id;
  } catch {
    return `s-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  }
})();

// ─── Caret helpers ───────────────────────────────────────────────────────────
// Every remote op and every resync rewrites element.textContent wholesale,
// which destroys the selection. Without these the caret jumped to the start of
// the document whenever anyone else typed.

/** Character offset of the caret within `el`, or null if it is not inside. */
function readCaretOffset(el) {
  const sel = window.getSelection?.();
  if (!sel || sel.rangeCount === 0) return null;
  const range = sel.getRangeAt(0);
  if (!el.contains(range.startContainer)) return null;

  const probe = range.cloneRange();
  probe.selectNodeContents(el);
  probe.setEnd(range.startContainer, range.startOffset);
  return probe.toString().length;
}

/** Put the caret `offset` characters into `el`, clamped to its content. */
function writeCaretOffset(el, offset) {
  if (offset == null) return;
  const length = (el.textContent ?? "").length;
  const target = Math.max(0, Math.min(offset, length));

  const range = document.createRange();
  const node = el.firstChild;
  if (node && node.nodeType === Node.TEXT_NODE) {
    range.setStart(node, Math.min(target, node.length));
  } else {
    range.setStart(el, 0);
  }
  range.collapse(true);

  const sel = window.getSelection();
  sel.removeAllRanges();
  sel.addRange(range);
}

/**
 * Where a caret at `offset` ends up after `op` is applied.
 * Text inserted before the caret pushes it right; text deleted before it pulls
 * it left; a delete spanning the caret collapses it to the delete's start.
 */
function mapCaretThroughOp(offset, op) {
  if (offset == null) return null;
  // Batch sub-ops share one coordinate space and apply highest-position-first,
  // so walk them in the same order the document does.
  const prims = flatten(op).slice().sort((a, b) => b.pos - a.pos);

  let next = offset;
  for (const prim of prims) {
    if (prim.type === "insert") {
      if (prim.pos <= next) next += prim.text.length;
    } else if (prim.type === "delete") {
      const end = prim.pos + prim.len;
      if (end <= next) next -= prim.len;
      else if (prim.pos < next) next = prim.pos;
    }
  }
  return next;
}

export function useOT({ socket, docId, editorRef, onResync }) {
  const revisionRef = useRef(0);
  const syncRef = useRef(createSyncState());
  const prevContentRef = useRef("");
  const isApplyingRemote = useRef(false); // mutex — blocks handleEditorInput
  // Once the server has spoken, its content wins over any optimistic REST paint.
  const loadedRef = useRef(false);
  const onResyncRef = useRef(onResync);
  onResyncRef.current = onResync;
  // Set when a resync is requested, so the doc:load that answers it can be
  // distinguished from an ordinary join and reported to the user.
  const resyncPendingRef = useRef(false);

  const [content, setContent] = useState("");
  const [revision, setRevision] = useState(0);
  const [loaded, setLoaded] = useState(false);
  // "saved" means the server has acknowledged everything typed so far — not
  // that a timer elapsed.
  const [saveState, setSaveState] = useState("saved");

  const readText = useCallback(() => editorRef?.current?.textContent ?? "", [editorRef]);

  /**
   * Run a DOM write that must not be mistaken for user input.
   * The mutex is cleared on the next tick — after the input events the write
   * synchronously triggers — and is cleared even if `write` throws, which the
   * previous version did not do, latching the editor read-only.
   */
  const asRemoteWrite = useCallback((write) => {
    isApplyingRemote.current = true;
    try {
      write();
    } finally {
      setTimeout(() => { isApplyingRemote.current = false; }, 0);
    }
  }, []);

  /** Replace the editor's text, keeping the caret where the user expects it. */
  const writeText = useCallback((text, mapCaret) => {
    const el = editorRef?.current;
    if (!el) return;

    const before = readCaretOffset(el);
    prevContentRef.current = text;

    asRemoteWrite(() => {
      el.textContent = text;
      if (before != null) writeCaretOffset(el, mapCaret ? mapCaret(before) : before);
    });

    setContent(text);
  }, [editorRef, asRemoteWrite]);

  // ── Apply a remote op to the DOM ──────────────────────────────────────────
  const applyToEditor = useCallback((op) => {
    if (!editorRef?.current) return;
    const old = readText();
    const next = applyOp(old, op);
    if (next === old) return;
    writeText(next, (offset) => mapCaretThroughOp(offset, op));
  }, [editorRef, readText, writeText]);

  /**
   * Optimistic first paint from the REST fetch.
   *
   * AUTHORITY: the socket's doc:load is authoritative for content and revision;
   * this is only a placeholder to avoid a blank editor during the round trip.
   * It is a no-op once doc:load has arrived, and never overwrites text the user
   * has already typed — so the two sources cannot fight, and it is not
   * last-write-wins.
   */
  const seed = useCallback((text) => {
    if (loadedRef.current) return;
    if (!editorRef?.current) return;
    if (editorRef.current.textContent) return;
    if (!text) return;
    writeText(text);
  }, [editorRef, writeText]);

  // ── Diff two strings → insert/delete op ──────────────────────────────────
  const diffToOp = useCallback((oldText, newText) => {
    if (oldText === newText) return null;

    let start = 0;
    while (
      start < oldText.length &&
      start < newText.length &&
      oldText[start] === newText[start]
    ) start++;

    let oldEnd = oldText.length;
    let newEnd = newText.length;
    while (
      oldEnd > start &&
      newEnd > start &&
      oldText[oldEnd - 1] === newText[newEnd - 1]
    ) { oldEnd--; newEnd--; }

    const deleted = oldText.slice(start, oldEnd);
    const inserted = newText.slice(start, newEnd);

    if (deleted.length > 0 && inserted.length === 0) {
      return { type: "delete", pos: start, len: deleted.length };
    }
    if (inserted.length > 0 && deleted.length === 0) {
      return { type: "insert", pos: start, text: inserted };
    }
    if (deleted.length > 0 && inserted.length > 0) {
      return [
        { type: "delete", pos: start, len: deleted.length },
        { type: "insert", pos: start, text: inserted },
      ];
    }
    return null;
  }, []);

  // ── Wire a single op to the server and mark it outstanding ────────────────
  const sendOp = useCallback((op) => {
    if (!socket?.connected || isNoop(op)) return;
    socket.emit("op:submit", {
      docId,
      op,                        // `site` rides along inside the op
      revision: revisionRef.current,
    });
  }, [socket, docId]);

  // ── Send a local op, or buffer it while one is outstanding ────────────────
  const submitOp = useCallback((op) => {
    if (!socket?.connected || isNoop(op)) return;
    const { send } = applyLocal(syncRef.current, op);
    setSaveState("saving");
    if (send) sendOp(send);
  }, [socket, sendOp]);

  // ── Handle user keystrokes ────────────────────────────────────────────────
  const handleEditorInput = useCallback(() => {
    if (isApplyingRemote.current) return;

    const newText = readText();
    const oldText = prevContentRef.current;
    if (newText === oldText) return;

    prevContentRef.current = newText;

    // Local typing drives `content` too. It used to be updated ONLY by remote
    // ops and doc:load, so the word count, character count and save indicator
    // in EditorPage sat frozen until somebody else edited the document.
    setContent(newText);

    const op = diffToOp(oldText, newText);
    if (!op) return;

    const ops = (Array.isArray(op) ? op : [op]).map((o) => ({ ...o, site: SITE_ID }));
    ops.forEach(submitOp);
  }, [readText, diffToOp, submitOp]);

  // ── Socket event handlers ─────────────────────────────────────────────────
  useEffect(() => {
    if (!socket) return undefined;

    const onAck = ({ revision: rev }) => {
      revisionRef.current = rev;
      setRevision(rev);
      const { send } = receiveAck(syncRef.current);
      if (send) sendOp(send);
      // Only "saved" once nothing is outstanding AND nothing is queued behind
      // it. This is what makes the indicator mean acknowledged-by-the-server.
      const { pending, buffer } = syncRef.current;
      if (!pending && buffer.length === 0) setSaveState("saved");
    };

    const onBroadcast = ({ op, revision: rev }) => {
      revisionRef.current = rev;
      setRevision(rev);
      const { apply } = receiveRemote(syncRef.current, op);
      applyToEditor(apply);
    };

    // ── Recovery ────────────────────────────────────────────────────────
    // A submitted op the server could not apply used to be dropped in silence:
    // the editor already showed the text, so client and server diverged
    // permanently with nothing on screen to indicate it.
    //
    // RESYNC rather than retry-with-backoff. A retry would have to re-transform
    // the failed op against everything that landed while it was failing, and
    // the client cannot know what that was — the op it holds is expressed
    // against a state the server never accepted. Re-joining asks for
    // authoritative content and revision: unconditionally correct, one
    // document-sized payload.
    //
    // The trade-off is that un-acked local edits are discarded, so the user is
    // TOLD it happened (onResync) rather than watching text change under them.
    const RESYNC_CODES = new Set(["OP_FAILED", "LOCK_TIMEOUT", "INVALID_OP"]);

    const onDocError = ({ code }) => {
      if (!RESYNC_CODES.has(code)) return; // ACCESS_DENIED / NOT_FOUND: nothing to resync
      console.warn(`[useOT] ${code} — resynchronising from the server`);
      syncRef.current = createSyncState();
      setSaveState("saving");
      resyncPendingRef.current = true;
      socket.emit("doc:join", { docId });
    };

    const onDocLoad = ({ content: docContent, revision: rev }) => {
      const text = docContent ?? "";
      // Authoritative. Drop anything pending or buffered: those ops were diffed
      // against a document state the server is now telling us never existed.
      syncRef.current = createSyncState();
      loadedRef.current = true;
      revisionRef.current = rev;
      setLoaded(true);
      setRevision(rev);
      setSaveState("saved");

      // Preserve the caret across the swap, clamped to the new text. The
      // offset is the user's best anchor even after a resync; where it no
      // longer exists, clamping to the end is the least surprising place.
      writeText(text);

      if (resyncPendingRef.current) {
        resyncPendingRef.current = false;
        onResyncRef.current?.();
      }
    };

    socket.on("op:ack", onAck);
    socket.on("op:broadcast", onBroadcast);
    socket.on("doc:load", onDocLoad);
    socket.on("doc:error", onDocError);

    return () => {
      socket.off("op:ack", onAck);
      socket.off("op:broadcast", onBroadcast);
      socket.off("doc:load", onDocLoad);
      socket.off("doc:error", onDocError);
    };
  }, [socket, applyToEditor, sendOp, writeText, docId]);

  return {
    submitOp,
    handleEditorInput,
    seed,
    content,
    revision,
    loaded,
    saveState,
  };
}
