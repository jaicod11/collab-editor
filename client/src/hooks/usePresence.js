/**
 * hooks/usePresence.js
 * ─────────────────────────────────────────────────────────────────────────────
 * Tracks collaborator cursors, selections, and online status in real-time.
 *
 * Emits:   "presence:cursor"  { docId, userId, cursor: { top, left } }
 * Listens: "presence:update"  [{ userId, name, initials, color, cursor }]
 *          "presence:join"    { userId, name }
 *          "presence:leave"   { userId }
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
    if (!socket) return;

    const onUpdate = (users) => {
      setCollaborators(
        users
          .filter((u) => u.userId !== currentUser?.id) // exclude self
          .map((u) => ({
            ...u,
            color: colorFor(u.userId),
          }))
      );
    };

    const onJoin = ({ userId, name, initials }) => {
      setCollaborators((prev) => {
        if (prev.find((u) => u.userId === userId)) return prev;
        return [...prev, { userId, name, initials, color: colorFor(userId), cursor: null }];
      });
    };

    const onLeave = ({ userId }) => {
      setCollaborators((prev) => prev.filter((u) => u.userId !== userId));
    };

    const onCursor = ({ userId, cursor }) => {
      setCollaborators((prev) =>
        prev.map((u) => (u.userId === userId ? { ...u, cursor } : u))
      );
    };

    socket.on("presence:update",  onUpdate);
    socket.on("presence:join",    onJoin);
    socket.on("presence:leave",   onLeave);
    socket.on("presence:cursor",  onCursor);

    return () => {
      socket.off("presence:update",  onUpdate);
      socket.off("presence:join",    onJoin);
      socket.off("presence:leave",   onLeave);
      socket.off("presence:cursor",  onCursor);
      clearTimeout(throttleRef.current);
    };
  }, [socket, currentUser]);

  return { collaborators, broadcastCursor };
}
