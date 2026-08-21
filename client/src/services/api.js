/**
 * services/api.js
 * ─────────────────────────────────────────────────────────────────────────────
 * Axios instance with:
 *   - Base URL from env
 *   - JWT Authorization header injected on every request
 *   - 401 → redirect to /auth (token expired)
 *   - Request/response logging in development
 */

import axios from "axios";
import { useAuthStore, getAuthToken } from "../store/authSlice";

const api = axios.create({
  baseURL: import.meta.env?.VITE_API_URL ?? "http://localhost:4000/api",
  timeout: 10_000,
  headers: { "Content-Type": "application/json" },
});

// ── Request interceptor: attach JWT ─────────────────────────────────────────
api.interceptors.request.use(
  (config) => {
    // Read from the persisted store. This used to read a separate localStorage
    // "token" key that the store knew nothing about; when the two diverged,
    // requests went out unauthenticated while the UI still believed it was
    // signed in.
    const token = getAuthToken();
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  },
  (error) => Promise.reject(error)
);

// ── Response interceptor: handle auth errors ─────────────────────────────────
api.interceptors.response.use(
  (response) => response,
  (error) => {
    // Only a rejected TOKEN ends the session. The server tags those 401s with
    // code "AUTH_REQUIRED"; other 401s are ordinary business failures — a wrong
    // current password on the settings page, bad credentials at sign-in — and
    // must not sign the user out of a perfectly good session.
    //
    // Deliberately does nothing on 503: Phase 1.5 returns that when the session
    // store is unreachable precisely so a cache blip cannot destroy sessions.
    const status = error.response?.status;
    const code = error.response?.data?.code;

    if (status === 401 && code === "AUTH_REQUIRED") {
      // One teardown path, so the store and storage can never disagree.
      useAuthStore.getState().logout();
      if (!window.location.pathname.startsWith("/auth")) {
        window.location.href = "/auth";
      }
    }
    return Promise.reject(error);
  }
);

export default api;
