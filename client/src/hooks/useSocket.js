/**
 * hooks/useSocket.js
 * Uses the singleton socketService instead of creating a new connection.
 * Prevents double-connection causing "Offline" state in editor.
 */

import { useEffect, useRef, useState } from "react";
import socketService from "../services/socket";

export function useSocket(docId) {
  const [connected, setConnected] = useState(false);
  const [error, setError] = useState(null);
  const socketRef = useRef(null);

  useEffect(() => {
    if (!docId) return;

    // Get or create the singleton socket
    const socket = socketService.connect();
    socketRef.current = socket;

    // Sync connected state
    const onConnect = () => { setConnected(true); setError(null); };
    const onDisconnect = () => setConnected(false);
    const onError = (err) => setError(err.message);

    // If already connected, set state immediately
    if (socket.connected) {
      setConnected(true);
      socket.emit("doc:join", { docId });
    }

    socket.on("connect", onConnect);
    socket.on("disconnect", onDisconnect);
    socket.on("connect_error", onError);

    // Join document room once connected
    socket.on("connect", () => {
      socket.emit("doc:join", { docId });
    });

    // If socket was already connected before this effect ran
    if (socket.connected) {
      socket.emit("doc:join", { docId });
    }

    return () => {
      socket.emit("doc:leave", { docId });
      socket.off("connect", onConnect);
      socket.off("disconnect", onDisconnect);
      socket.off("connect_error", onError);
    };
  }, [docId]);

  return { socket: socketRef.current, connected, error };
}