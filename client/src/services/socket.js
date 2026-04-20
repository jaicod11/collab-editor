/**
 * services/socket.js
 * ─────────────────────────────────────────────────────────────────────────────
 * Socket.io client singleton.
 *
 * Why a singleton?
 *   - Prevents multiple Socket.io connections if components remount
 *   - Lets any module emit events without prop-drilling the socket
 *   - useSocket.js uses this under the hood
 *
 * Usage:
 *   import socketService from "../services/socket";
 *
 *   // Connect (call once, at app boot or on login)
 *   const socket = socketService.connect();
 *
 *   // Get the existing socket from anywhere
 *   const socket = socketService.getSocket();
 *
 *   // Disconnect (call on logout)
 *   socketService.disconnect();
 */

import { io } from "socket.io-client";

const WS_URL = import.meta.env.VITE_WS_URL ?? "http://localhost:4000";

class SocketService {
  constructor() {
    this._socket = null;
  }

  /**
   * Create (or return existing) socket connection.
   * Reads JWT from localStorage automatically.
   */
  connect() {
    if (this._socket?.connected) return this._socket;

    const token = localStorage.getItem("token");

    this._socket = io(WS_URL, {
      auth:                { token },
      transports:          ["websocket", "polling"],
      reconnectionDelay:   500,
      reconnectionAttempts: 10,
      autoConnect:         true,
    });

    this._socket.on("connect", () => {
      console.log("[Socket] Connected:", this._socket.id);
    });

    this._socket.on("disconnect", (reason) => {
      console.warn("[Socket] Disconnected:", reason);
    });

    this._socket.on("connect_error", (err) => {
      console.error("[Socket] Connection error:", err.message);
    });

    this._socket.on("auth:error", ({ message }) => {
      console.error("[Socket] Auth error:", message);
      this.disconnect();
      // Redirect to login
      window.location.href = "/auth";
    });

    return this._socket;
  }

  /** Return existing socket (or null if not connected). */
  getSocket() {
    return this._socket;
  }

  /** Cleanly disconnect and clear the singleton. */
  disconnect() {
    if (this._socket) {
      this._socket.disconnect();
      this._socket = null;
    }
  }

  /** Re-auth after token refresh without full reconnect. */
  updateToken(token) {
    if (this._socket) {
      this._socket.auth = { token };
    }
  }
}

const socketService = new SocketService();
export default socketService;
