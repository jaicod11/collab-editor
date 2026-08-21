/**
 * services/sessionSocket.js
 * ─────────────────────────────────────────────────────────────────────────────
 * Keeps the socket connection in step with the auth session.
 *
 * The socket used to be connected only inside authSlice.login(). On reload the
 * store rehydrates but login() never runs, so the connection was never
 * established — the editor mounted with no socket and nothing synced until
 * useSocket happened to call connect() itself.
 *
 * Subscribing to the store covers every case with one rule: a token means a
 * connection, no token means none. That includes the initial (already
 * rehydrated) state, a later login, a logout, and a token swapped out after a
 * password change.
 *
 * Lives outside the store so authSlice stays free of side effects and can be
 * imported in tests without a browser.
 */

import { useAuthStore } from "../store/authSlice";
import socketService from "./socket";

let currentToken = null;

function sync(token) {
  if (token === currentToken) return;
  currentToken = token;

  if (!token) {
    socketService.disconnect();
    return;
  }

  // Reconnect under the new credentials rather than reusing a socket that
  // authenticated with the old ones.
  socketService.disconnect();
  socketService.connect();
}

/** Wire the socket to the session. Safe to call once at app start. */
export function startSessionSocket() {
  // persist uses synchronous storage, so by the time this runs the rehydrated
  // token is already in the store.
  sync(useAuthStore.getState().token);
  return useAuthStore.subscribe((state) => sync(state.token));
}
