/**
 * hooks/usePresence.js
 * ─────────────────────────────────────────────────────────────────────────────
 * Tracks collaborator cursors, selections, and online status in real-time.
 *
 * Emits:   "presence:cursor"  { docId, userId, cursor: { top, left } }
 * Listens: "presence:update"  [{ userId, name, initials }]  full roster, sent
 *                             to THIS socket when it joins a document
 *          "presence:join"    { userId, name, initials }    someone arrived after us
 *          "presence:leave"   { userId }
 *          "presence:cursor"  { userId, cursor }
 *
 * The roster matters because presence:join is only broadcast to sockets ALREADY
 * in the room. Without an initial roster, a user joining an active document saw
 * nobody — only people who arrived after them — and their cursors were dropped.
 */

import { useEffect, useRef, useState, useCallback } from "react";

// Assign a consistent color to each user by ID
const COLORS = [
  "bg-blue-400",   "bg-teal-400",   "bg-purple-400",
  "bg-orange-400", "bg-rose-400",   "bg-indigo-400",
];
const colorFor = (userId) =>
  COLORS[Math.abs(userId.split("").reduce((acc, c) => acc + c.charCodeAt(0), 0)) % COLORS.length];

/**
 * @param {{ socket, docId, editorRef, currentUser }}
 * @returns {{ collaborators, broadcastCursor }}
 */
export function usePresence({ socket, docId, editorRef, currentUser }) {
  const [collaborators, setCollaborators] = useState([]);
  const throttleRef = useRef(null);
  // userId -> last cursor seen before we knew who they were.
  const pendingCursorsRef = useRef(new Map());

  // Throttle timer is owned by the hook's lifetime, not by the socket effect —
  // clearing it when the socket merely changes identity would drop a pending
  // broadcast for no reason.
  useEffect(() => () => clearTimeout(throttleRef.current), []);

  // ── Broadcast our cursor position on mouse move / key press ─────────────
  const broadcastCursor = useCallback(() => {
    if (!socket || !editorRef?.current || !currentUser) return;

    // Throttle to 30fps
    if (throttleRef.current) return;
    throttleRef.current = setTimeout(() => {
      throttleRef.current = null;

      const selection = window.getSelection();
      if (!selection || selection.rangeCount === 0) return;

      const range = selection.getRangeAt(0);
      const rect  = range.getBoundingClientRect();
      const parentRect = editorRef.current.getBoundingClientRect();

      const cursor = {
        top:  rect.top  - parentRect.top,
        left: rect.left - parentRect.left,
      };

      socket.emit("presence:cursor", { docId, userId: currentUser.id, cursor });
    }, 33); // ~30fps
  }, [socket, editorRef, docId, currentUser]);

  // ── Socket listeners ──────────────────────────────────────────────────────
  useEffect(() => {
    if (!socket) return undefined;

    const decorate = (u) => ({
      userId: u.userId,
      name: u.name,
      initials: u.initials,
      color: colorFor(u.userId),
      // A cursor may have arrived before we knew who this was.
      cursor: pendingCursorsRef.current.get(u.userId) ?? null,
    });

    // Full roster for the document we just joined.
    const onUpdate = (users) => {
      const list = Array.isArray(users) ? users : [];
      setCollaborators(
        list.filter((u) => u.userId !== currentUser?.id).map(decorate)
      );
    };

    const onJoin = ({ userId, name, initials }) => {
      if (userId === currentUser?.id) return;
      setCollaborators((prev) => {
        if (prev.some((u) => u.userId === userId)) return prev;
        return [...prev, decorate({ userId, name, initials })];
      });
    };

    const onLeave = ({ userId }) => {
      pendingCursorsRef.current.delete(userId);
      setCollaborators((prev) => prev.filter((u) => u.userId !== userId));
    };

    const onCursor = ({ userId, cursor }) => {
      if (userId === currentUser?.id) return;
      // Cursor events can outrun the roster: presence:cursor is relayed
      // immediately while presence:join/update takes a round trip through the
      // room. These used to be dropped on the floor by a `.map` that matched
      // nothing, so a collaborator's caret never appeared until they happened
      // to move it again after we had learned their name. Hold the last known
      // position and attach it when the roster catches up.
      pendingCursorsRef.current.set(userId, cursor);
      setCollaborators((prev) => {
        if (!prev.some((u) => u.userId === userId)) return prev;
        return prev.map((u) => (u.userId === userId ? { ...u, cursor } : u));
      });
    };

    socket.on("presence:update", onUpdate);
    socket.on("presence:join", onJoin);
    socket.on("presence:leave", onLeave);
    socket.on("presence:cursor", onCursor);

    return () => {
      socket.off("presence:update", onUpdate);
      socket.off("presence:join", onJoin);
      socket.off("presence:leave", onLeave);
      socket.off("presence:cursor", onCursor);
    };
  }, [socket, currentUser?.id]);

  return { collaborators, broadcastCursor };
}
