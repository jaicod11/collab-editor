/**
 * socket/socketServer.js
 * ─────────────────────────────────────────────────────────────────────────────
 * Initialises Socket.io with:
 *   1. JWT authentication middleware on every connection
 *   2. Redis pub/sub — ops published here are forwarded to ALL server nodes
 *      (scales horizontally with @socket.io/redis-adapter in production)
 *   3. Registers document and presence event handlers
 */

const jwt              = require("jsonwebtoken");
const { redisSub, redisClient } = require("../config/redis");
const sessionService   = require("../services/sessionService");
const documentHandler  = require("./handlers/documentHandler");
const presenceHandler  = require("./handlers/presenceHandler");

const CHANNEL_PREFIX = "doc:ops:"; // Redis pub/sub channel per document

// Fan-out to a specific USER wherever they are connected, and forced access
// revocation. Both go through Redis rather than a local io.to(), so they work
// across nodes — a user's sockets may be on a different process from the owner
// who approved them.
const USER_CHANNEL = "user:notify";
const REVOKE_CHANNEL = "doc:revoke";

module.exports = function initSocket(io) {

  // ── Auth middleware ────────────────────────────────────────────────────────
  io.use(async (socket, next) => {
    const token = socket.handshake.auth?.token;
    if (!token) return next(new Error("No token provided"));

    // ── 1. Verify the signature ───────────────────────────────────────────
    let payload;
    try {
      payload = jwt.verify(token, process.env.JWT_SECRET);
    } catch (err) {
      return next(new Error("Invalid token"));
    }

    // ── 2. Confirm the session is still live ──────────────────────────────
    // Shares one implementation with authMiddleware.protect so the two cannot
    // drift: Redis fast path, MongoDB tokenVersion as the source of truth.
    const { status, error } = await sessionService.resolveSession(payload);

    if (status === sessionService.SESSION_UNAVAILABLE) {
      console.error("[Socket] Session store unavailable:", error?.message);
      return next(new Error("Auth service temporarily unavailable"));
    }

    if (status !== sessionService.SESSION_OK) {
      return next(new Error("Session expired or revoked"));
    }

    socket.user = { id: payload.id, name: payload.name, email: payload.email };
    next();
  });

  // ── Redis subscriber — forward published ops to correct Socket.io room ─────
  // This is what makes multi-node scaling work: any node can publish,
  // all subscribers forward to their connected clients.
  redisSub.pSubscribe(`${CHANNEL_PREFIX}*`, (message, channel) => {
    try {
      const docId   = channel.replace(CHANNEL_PREFIX, "");
      const payload = JSON.parse(message);
      // Broadcast to the room (excluding the original sender's socket)
      io.to(`doc:${docId}`).except(payload._socketId).emit("op:broadcast", {
        op:       payload.op,
        revision: payload.revision,
        userId:   payload.userId,
      });
    } catch (e) {
      console.error("[Socket] Redis pSubscribe parse error:", e);
    }
  });

  // ── Cross-node user notifications ─────────────────────────────────────────
  // Published by the REST layer (approve/deny) and delivered to whichever node
  // holds that user's sockets.
  redisSub.subscribe(USER_CHANNEL, (message) => {
    try {
      const { userId, event, payload } = JSON.parse(message);
      io.to(`user:${userId}`).emit(event, payload);
    } catch (e) {
      console.error("[Socket] user notify parse error:", e);
    }
  });

  /** Every socket connected to THIS node that is in `room`. */
  function localSocketsIn(room) {
    const ids = io.sockets.adapter.rooms.get(room);
    if (!ids) return [];
    return [...ids].map((id) => io.sockets.sockets.get(id)).filter(Boolean);
  }

  // ── Cross-node access revocation ──────────────────────────────────────────
  // Runs server-side work on the user's sockets — dropping the cached access
  // grant and forcing them out of the document room. It calls into each local
  // socket directly rather than emitting: an emit goes to the browser, which
  // cannot invalidate a cache that lives on the server. Redis fans the message
  // out so every node does this for the sockets it holds.
  redisSub.subscribe(REVOKE_CHANNEL, (message) => {
    try {
      const { docId, userId, disconnect } = JSON.parse(message);
      for (const socket of localSocketsIn(`user:${userId}`)) {
        socket.data.revokeDocumentAccess?.(docId, { disconnect });
      }
    } catch (e) {
      console.error("[Socket] revoke parse error:", e);
    }
  });

  // ── Connection handler ─────────────────────────────────────────────────────
  io.on("connection", (socket) => {
    console.log(`[Socket] Connected: ${socket.user.name} (${socket.id})`);

    // Personal room: lets the server reach a specific person regardless of
    // which documents they have open, which is how an approval can push them
    // straight into the editor.
    socket.join(`user:${socket.user.id}`);

    // Register handlers
    documentHandler(io, socket, redisClient, CHANNEL_PREFIX);
    presenceHandler(io, socket);

    socket.on("disconnect", (reason) => {
      console.log(`[Socket] Disconnected: ${socket.user.name} — ${reason}`);
    });

    socket.on("error", (err) => {
      console.error(`[Socket] Error from ${socket.user.name}:`, err.message);
    });
  });

  console.log("[Socket] Socket.io initialised");

  // Handed to Express (see index.js) so REST handlers can reach connected
  // sockets without importing io directly.
  return {
    /** Deliver an event to every socket belonging to one user, on any node. */
    notifyUser(userId, event, payload) {
      redisClient
        .publish(USER_CHANNEL, JSON.stringify({ userId, event, payload }))
        .catch((e) => console.error("[Socket] notifyUser publish failed:", e.message));
    },

    /**
     * Invalidate a user's cached access to a document, and optionally force
     * their sockets out of the room. Without this a collaborator removed
     * mid-session keeps editing until they reconnect, because documentHandler
     * memoises the grant per socket.
     */
    revokeDocumentAccess(docId, userId, { disconnect = true } = {}) {
      redisClient
        .publish(REVOKE_CHANNEL, JSON.stringify({ docId, userId, disconnect }))
        .catch((e) => console.error("[Socket] revoke publish failed:", e.message));
    },
  };
};
