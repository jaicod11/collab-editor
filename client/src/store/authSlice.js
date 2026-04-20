/**
 * store/authSlice.js
 * ─────────────────────────────────────────────────────────────────────────────
 * Zustand auth store — persisted to localStorage.
 *
 * Usage:
 *   import { useAuthStore } from "./authSlice";
 *   const { user, token, login, logout, updateUser } = useAuthStore();
 *
 * All other files that previously imported from store/index.js for auth
 * should import from here instead.
 */

import { create } from "zustand";
import { persist } from "zustand/middleware";
import socketService from "../services/socket";

export const useAuthStore = create(
  persist(
    (set, get) => ({
      user:  null,   // { id, name, email, avatar }
      token: null,
      isAuthenticated: false,

      /**
       * Called after successful login or register.
       * Stores token + user, boots the socket connection.
       */
      login: ({ user, token }) => {
        localStorage.setItem("token", token);
        socketService.connect();          // boot socket on login
        set({ user, token, isAuthenticated: true });
      },

      /**
       * Clear session + disconnect socket.
       */
      logout: () => {
        localStorage.removeItem("token");
        socketService.disconnect();
        set({ user: null, token: null, isAuthenticated: false });
      },

      /**
       * Patch individual user fields (e.g. after profile update).
       */
      updateUser: (patch) =>
        set((s) => ({ user: s.user ? { ...s.user, ...patch } : null })),

      /**
       * Refresh token in memory + socket auth header.
       */
      refreshToken: (newToken) => {
        localStorage.setItem("token", newToken);
        socketService.updateToken(newToken);
        set({ token: newToken });
      },

      /**
       * Derived helper — true when token exists.
       */
      get isLoggedIn() {
        return !!get().token;
      },
    }),
    {
      name:       "collab-auth",
      partialize: (s) => ({ user: s.user, token: s.token, isAuthenticated: s.isAuthenticated }),
    }
  )
);
