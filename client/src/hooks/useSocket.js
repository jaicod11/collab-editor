/**
 * hooks/useSocket.js
 * ─────────────────────────────────────────────────────────────────────────────
 * Owns the connection to one document room, on top of the socketService
 * singleton.
 *
 * ── What this replaces ───────────────────────────────────────────────────────
 * The previous version registered TWO "connect" handlers — one named, one
 * anonymous — and cleanup could only remove the named one. The socket outlives
 * the component, so every navigation into the editor leaked another handler,
 * and StrictMode doubled it in dev. After N visits a single reconnect fired N
 * doc:join emits.
 *
 * It also emitted doc:join up to three times per mount: once at line 30, again
 * from the anonymous connect handler, and a third time at line 44 from a block
 * duplicating the first.
 *
 * Now: exactly one doc:join per (document, connection), every listener held in
 * a named binding so cleanup can remove it, and `socket` returned as state so
 * consumers re-render when it becomes available rather than reading a ref
 * mutation React never saw.
 */

import { useEffect, useState } from "react";
import socketService from "../services/socket";

export function useSocket(docId) {
  // State, not a ref: assigning a ref does not schedule a render, so consumers
  // (useOT, usePresence) could sit on `null` past the point where doc:load had
  // already arrived and been dropped for want of a listener.
  const [socket, setSocket] = useState(null);
  const [connected, setConnected] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!docId) return undefined;

    const s = socketService.connect();
    setSocket(s);

    // Scoped to this effect run, so a remount starts clean and a reconnect
    // re-joins exactly once. The server drops room membership when the socket
    // drops, so re-joining after `connect` is required, not optional.
    let joined = false;

    const join = () => {
      if (joined) return;
      joined = true;
      s.emit("doc:join", { docId });
    };

    const onConnect = () => {
      setConnected(true);
      setError(null);
      joined = false; // fresh connection — the previous join did not survive it
      join();
    };

    const onDisconnect = () => {
      setConnected(false);
      joined = false;
    };

    const onConnectError = (err) => setError(err.message);

    s.on("connect", onConnect);
    s.on("disconnect", onDisconnect);
    s.on("connect_error", onConnectError);

    // Already connected when this effect ran (the common case when navigating
    // between documents): no `connect` event is coming, so join here instead.
    if (s.connected) {
      setConnected(true);
      join();
    }

    return () => {
      if (joined) s.emit("doc:leave", { docId });
      s.off("connect", onConnect);
      s.off("disconnect", onDisconnect);
      s.off("connect_error", onConnectError);
    };
  }, [docId]);

  return { socket, connected, error };
}
