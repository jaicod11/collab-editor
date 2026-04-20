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
import { applyOp, transform } from "../lib/ot/operations";

export function useOT({ socket, docId, editorRef }) {
  const revisionRef = useRef(0);
  const pendingRef = useRef(null);
  const bufferRef = useRef([]);
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

  // ── Send a local op to the server ─────────────────────────────────────────
  const submitOp = useCallback((op) => {
    if (!socket?.connected) return;

    if (pendingRef.current) {
      // Already waiting for ack — buffer locally
      bufferRef.current.push(op);
      return;
    }

    pendingRef.current = op;
    socket.emit("op:submit", {
      docId,
      op: { ...op, revision: revisionRef.current },
      revision: revisionRef.current,
    });
  }, [socket, docId]);

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

    const ops = Array.isArray(op) ? op : [op];
    ops.forEach(submitOp);
  }, [readText, diffToOp, submitOp]);

  // ── Socket event handlers ─────────────────────────────────────────────────
  useEffect(() => {
    if (!socket) return;

    // Server acked our op
    const onAck = ({ revision: rev, op }) => {
      revisionRef.current = rev;
      setRevision(rev);
      pendingRef.current = null;

      // Flush buffer, transforming each against the acked op
      const flushed = [...bufferRef.current];
      bufferRef.current = [];
      flushed.forEach((buffered) => {
        const [transformed] = transform(buffered, op);
        submitOp(transformed);
      });
    };

    // Remote op from another user
    const onBroadcast = ({ op, revision: rev }) => {
      revisionRef.current = rev;
      setRevision(rev);

      if (pendingRef.current) {
        const [transformedPending, transformedRemote] = transform(pendingRef.current, op);
        pendingRef.current = transformedPending;
        bufferRef.current = bufferRef.current.map((buf) => {
          const [t] = transform(buf, transformedRemote);
          return t;
        });
        applyToEditor(transformedRemote);
      } else {
        applyToEditor(op);
      }
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
  }, [socket, applyToEditor, submitOp, editorRef]);

  return { submitOp, handleEditorInput, content, revision };
}