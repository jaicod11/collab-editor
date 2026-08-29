/**
 * hooks/useNotifications.js
 * ─────────────────────────────────────────────────────────────────────────────
 * The bell's data: a page of notifications, an unread count, and the two
 * mutations that clear it.
 *
 * Live arrivals come over the same personal `user:{id}` socket room the sharing
 * flow already uses, so a notification created on another node still reaches
 * this tab (socketServer publishes through Redis). The socket is the module
 * singleton, shared with the editor — this hook only adds and removes its own
 * named listener and never connects or disconnects it, because sessionSocket.js
 * owns that lifecycle.
 *
 * Counts come from the server rather than being derived from the loaded page:
 * the page is capped at 20 and the unread total is not.
 */

import { useState, useCallback, useEffect } from "react";
import api from "../services/api";
import socketService from "../services/socket";
import { useAuthStore } from "../store/authSlice";

export function useNotifications() {
  // The socket is torn down and rebuilt when the session token changes
  // (sessionSocket.js), so a listener attached once at mount would be talking
  // to a dead socket after a re-login. Keying the subscription on the token
  // re-attaches it to whichever socket is current.
  const token = useAuthStore((s) => s.token);

  const [notifications, setNotifications] = useState([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(false);
  const [loaded, setLoaded] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const { data } = await api.get("/notifications");
      setNotifications(data.notifications ?? []);
      setUnreadCount(data.unreadCount ?? 0);
      setHasMore(Boolean(data.hasMore));
      setLoaded(true);
      return data;
    } catch {
      // A failed poll must not blank a list the user is looking at.
      return null;
    } finally {
      setLoading(false);
    }
  }, []);

  const markRead = useCallback(async (id) => {
    // Optimistic: the dropdown closes on click, so waiting for the round trip
    // would show the badge un-decremented for as long as the request takes.
    setNotifications((prev) => prev.map((n) => (n._id === id ? { ...n, read: true } : n)));
    setUnreadCount((c) => Math.max(0, c - 1));
    try {
      const { data } = await api.patch(`/notifications/${id}/read`);
      setUnreadCount(data.unreadCount ?? 0); // authoritative
      return true;
    } catch {
      load(); // reconcile against the server rather than guessing
      return false;
    }
  }, [load]);

  const markAllRead = useCallback(async () => {
    setNotifications((prev) => prev.map((n) => ({ ...n, read: true })));
    setUnreadCount(0);
    try {
      await api.post("/notifications/read-all");
      return true;
    } catch {
      load();
      return false;
    }
  }, [load]);

  // ── Unread badge on first paint ───────────────────────────────────────────
  // Without this the count is zero until the dropdown is opened, which makes
  // the badge useless: its whole job is to tell you to open it.
  useEffect(() => {
    if (token) load();
  }, [token, load]);

  // ── Live arrivals ─────────────────────────────────────────────────────────
  useEffect(() => {
    if (!token) return undefined;
    const socket = socketService.getSocket() ?? socketService.connect();
    if (!socket) return undefined;

    const onNew = ({ notification }) => {
      if (!notification?._id) return;
      setNotifications((prev) =>
        // The socket can outlive a refetch, so a row that arrived both ways
        // must not appear twice.
        prev.some((n) => n._id === notification._id) ? prev : [notification, ...prev]
      );
      if (!notification.read) setUnreadCount((c) => c + 1);
    };

    socket.on("notification:new", onNew);
    return () => socket.off("notification:new", onNew);
  }, [token]);

  return {
    notifications, unreadCount, hasMore, loading, loaded,
    load, markRead, markAllRead,
  };
}
