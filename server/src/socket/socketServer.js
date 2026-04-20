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
const documentHandler  = require("./handlers/documentHandler");
const presenceHandler  = require("./handlers/presenceHandler");

const CHANNEL_PREFIX = "doc:ops:"; // Redis pub/sub channel per document

module.exports = function initSocket(io) {

  // ── Auth middleware ────────────────────────────────────────────────────────
  io.use((socket, next) => {
    try {
      const token = socket.handshake.auth?.token;
      if (!token) return next(new Error("No token provided"));

      const payload = jwt.verify(token, process.env.JWT_SECRET);
      socket.user = { id: payload.id, name: payload.name, email: payload.email };
      next();
    } catch (err) {
      next(new Error("Invalid token"));
    }
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

  // ── Connection handler ─────────────────────────────────────────────────────
  io.on("connection", (socket) => {
    console.log(`[Socket] Connected: ${socket.user.name} (${socket.id})`);

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
};
