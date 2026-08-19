/**
 * hooks/useOT.js
 * ─────────────────────────────────────────────────────────────────────────────
 * Client-side Operational Transformation engine.
 *
 * Fixes applied:
 *  1. isApplyingRemote mutex — completely blocks handleEditorInput when a
 *     remote op is being applied to the DOM, preventing the feedback loop
 *     that caused palindrome / garbled text.
 *  2. textContent instead of innerText — no layout-dependent newlines.
 *  3. prevContentRef updated before DOM write — belt-and-suspenders guard.
 */

import { useEffect, useRef, useCallback, useState } from "react";
import { applyOp, isNoop } from "../lib/ot/operations";
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

export function useOT({ socket, docId, editorRef }) {
  const revisionRef = useRef(0);
  // Pending/buffer bookkeeping lives in shared/ot/client-sync.js so it is
  // testable without React and cannot drift from what the tests exercise.
  const syncRef = useRef(createSyncState());
  const prevContentRef = useRef("");
  const isApplyingRemote = useRef(false); // mutex — blocks handleEditorInput

  const [content, setContent] = useState("");
  const [revision, setRevision] = useState(0);

  // ── Read text from editor reliably ────────────────────────────────────────
  const readText = useCallback(() => {
    return editorRef?.current?.textContent ?? "";
  }, [editorRef]);

  // ── Apply a remote op to the DOM ──────────────────────────────────────────
  const applyToEditor = useCallback((op) => {
    if (!editorRef?.current) return;

    const old = readText();
    const next = applyOp(old, op);
    if (next === old) return;

    // 1. Lock — prevent handleEditorInput from treating this as user input
    isApplyingRemote.current = true;

    // 2. Sync prevContentRef BEFORE the DOM write
    prevContentRef.current = next;

    // 3. Write to DOM
    editorRef.current.textContent = next;
    setContent(next);

    // 4. Unlock after all synchronous events from the DOM write have fired
    setTimeout(() => {
      isApplyingRemote.current = false;
    }, 0);
  }, [editorRef, readText]);

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
    if (send) sendOp(send);
  }, [socket, sendOp]);

  // ── Handle user keystrokes ────────────────────────────────────────────────
  const handleEditorInput = useCallback(() => {
    // Hard block — do nothing if we're applying a remote op
    if (isApplyingRemote.current) return;

    const newText = readText();
    const oldText = prevContentRef.current;

    if (newText === oldText) return;

    prevContentRef.current = newText;

    const op = diffToOp(oldText, newText);
    if (!op) return;

    const ops = (Array.isArray(op) ? op : [op]).map((o) => ({ ...o, site: SITE_ID }));
    ops.forEach(submitOp);
  }, [readText, diffToOp, submitOp]);

  // ── Socket event handlers ─────────────────────────────────────────────────
  useEffect(() => {
    if (!socket) return;

    // Server acked our outstanding op
    const onAck = ({ revision: rev }) => {
      revisionRef.current = rev;
      setRevision(rev);
      const { send } = receiveAck(syncRef.current);
      if (send) sendOp(send);
    };

    // Remote op from another user
    const onBroadcast = ({ op, revision: rev }) => {
      revisionRef.current = rev;
      setRevision(rev);
      // Rebases the outstanding op and the buffer, and returns the remote op
      // expressed against the document the editor actually shows.
      const { apply } = receiveRemote(syncRef.current, op);
      applyToEditor(apply);
    };

    // Initial document load
    const onDocLoad = ({ content: docContent, revision: rev }) => {
      const text = docContent ?? "";
      revisionRef.current = rev;
      prevContentRef.current = text;
      setContent(text);
      setRevision(rev);

      if (editorRef?.current) {
        isApplyingRemote.current = true;
        editorRef.current.textContent = text;
        setTimeout(() => { isApplyingRemote.current = false; }, 0);
      }
    };

    socket.on("op:ack", onAck);
    socket.on("op:broadcast", onBroadcast);
    socket.on("doc:load", onDocLoad);

    return () => {
      socket.off("op:ack", onAck);
      socket.off("op:broadcast", onBroadcast);
      socket.off("doc:load", onDocLoad);
    };
  }, [socket, applyToEditor, sendOp, editorRef]);

  return { submitOp, handleEditorInput, content, revision };
}