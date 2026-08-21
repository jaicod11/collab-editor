/**
 * store/authSlice.js
 * ─────────────────────────────────────────────────────────────────────────────
 * Zustand auth store, persisted to localStorage under "collab-auth".
 *
 * ── Single source of truth ───────────────────────────────────────────────────
 * The persisted store IS the session. There is no separate localStorage "token"
 * key any more: login() used to write one directly while `persist` wrote another
 * copy inside "collab-auth", and the 401 interceptor cleared only the first.
 * That left the store reporting isAuthenticated:true with a token while every
 * request went out unauthenticated — 401, redirect, guard bounces back, forever.
 * Everything now reads `useAuthStore.getState().token` and tears down through
 * logout().
 *
 * ── Why there is no getter in here ───────────────────────────────────────────
 * This module used to define `get isLoggedIn() { return !!get().token; }`.
 * zustand's default merge spreads the current state during rehydration, which
 * INVOKES that getter — and at that point `get()` is still undefined, so
 * `get().token` threw. persist catches rehydration errors silently, so hydration
 * simply never completed: `hasHydrated()` stayed false and the persisted token
 * was never restored. Reloading the page looked exactly like being signed out.
 *
 * Nothing referenced it. Derive values in components instead; never put a getter
 * (or anything else that can throw when read) on persisted state.
 *
 * Socket lifecycle deliberately lives in services/sessionSocket.js rather than
 * here, so this module stays pure and testable outside a browser.
 */

import { create } from "zustand";
import { persist } from "zustand/middleware";

export const useAuthStore = create(
  persist(
    (set) => ({
      user: null,   // { id, name, email, avatar }
      token: null,
      isAuthenticated: false,

      /** Called after a successful login or register. */
      login: ({ user, token }) => set({ user, token, isAuthenticated: true }),

      /**
       * The ONE teardown path. Called by the user signing out and by the API
       * layer when the server rejects our token, so the two can never disagree.
       */
      logout: () => set({ user: null, token: null, isAuthenticated: false }),

      /** Patch individual user fields (e.g. after a profile update). */
      updateUser: (patch) =>
        set((s) => ({ user: s.user ? { ...s.user, ...patch } : null })),

      /**
       * Swap in a freshly issued token — used after a password change, which
       * revokes every token issued before it.
       */
      refreshToken: (newToken) => set({ token: newToken }),
    }),
    {
      name: "collab-auth",
      partialize: (s) => ({ user: s.user, token: s.token, isAuthenticated: s.isAuthenticated }),
    }
  )
);

/** The current token, for non-React callers (the axios interceptor, sockets). */
export function getAuthToken() {
  return useAuthStore.getState().token ?? null;
}

/** True once persist has finished reading localStorage. */
export function hasHydrated() {
  return useAuthStore.persist?.hasHydrated?.() ?? true;
}
