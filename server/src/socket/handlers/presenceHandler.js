/**
 * socket/handlers/presenceHandler.js
 * ─────────────────────────────────────────────────────────────────────────────
 * Handles real-time presence events:
 *
 *  Client → Server:
 *    "presence:cursor" { docId, cursor: { top, left } }
 *
 *  Server → Room (others):
 *    "presence:cursor" { userId, cursor }
 *    "presence:join"   { userId, name, initials }   ← sent by documentHandler
 *    "presence:leave"  { userId }                   ← sent on disconnect
 *
 * Cursor positions are forwarded at high frequency (client throttles to 30fps).
 * We do NOT persist cursor positions — they are ephemeral.
 */

module.exports = function presenceHandler(io, socket) {
  const { user } = socket;

  // ── presence:cursor ────────────────────────────────────────────────────────
  // Forward cursor position to all other users in the same document room.
  // No DB writes — pure real-time relay.
  socket.on("presence:cursor", ({ docId, cursor }) => {
    if (!docId || !cursor) return;

    // Relay to everyone in the room except sender
    socket.to(`doc:${docId}`).emit("presence:cursor", {
      userId: user.id,
      cursor,
    });
  });

  // ── presence:leave on disconnect ──────────────────────────────────────────
  // Socket.io rooms the socket is in when it disconnects
  const rooms = require("../rooms");
  socket.on("disconnecting", () => {
    const affected = rooms.leaveAll(socket.id);
    affected.forEach((docId) => {
      socket.to(`doc:${docId}`).emit("presence:leave", { userId: user.id });
    });
  });
};
