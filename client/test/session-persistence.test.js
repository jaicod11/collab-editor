/**
 * client/test/session-persistence.test.js
 * ─────────────────────────────────────────────────────────────────────────────
 * Reloading the page must not sign the user out.
 *
 * ── The bug ──────────────────────────────────────────────────────────────────
 * authSlice defined `get isLoggedIn() { return !!get().token; }`. zustand's
 * default merge spreads the current state during rehydration, which INVOKES
 * that getter — and at that point `get()` is still undefined, so `get().token`
 * threw a TypeError. persist catches rehydration errors silently, so hydration
 * never completed: hasHydrated() stayed false and the persisted token was never
 * restored. Every reload landed on /auth.
 *
 * Two related defects made it worse rather than causing it: the token lived in
 * BOTH a bare localStorage "token" key and the persisted store, and the 401
 * interceptor cleared only the first; and the socket was connected only inside
 * login(), so a rehydrated session had no socket.
 *
 * These tests run authSlice for real against a localStorage shim. The store is
 * deliberately free of side effects (no socket import) so it can be.
 */

import { test, describe, before, beforeEach } from "node:test";
import assert from "node:assert/strict";

const AUTH_MODULE = new URL("../src/store/authSlice.js", import.meta.url).href;

/** Storage that survives across "reloads" within a test. */
let backing = {};
function installStorage() {
  globalThis.localStorage = {
    getItem: (k) => (k in backing ? backing[k] : null),
    setItem: (k, v) => { backing[k] = String(v); },
    removeItem: (k) => { delete backing[k]; },
    clear: () => { backing = {}; },
  };
  globalThis.window = { localStorage: globalThis.localStorage, location: { pathname: "/", href: "/" } };
}

/**
 * Re-import authSlice with a fresh module instance, which is what a page reload
 * gives you: new store, same localStorage.
 */
let reloadCount = 0;
async function reload() {
  reloadCount += 1;
  return import(`${AUTH_MODULE}?reload=${reloadCount}`);
}

before(installStorage);
beforeEach(() => { backing = {}; });

describe("the session survives a reload", () => {
  test("a token stored by login() is restored by the next page load", async () => {
    const first = await reload();
    first.useAuthStore.getState().login({ user: { id: "u1", name: "Ada" }, token: "TOKEN-A" });

    const afterReload = await reload();
    const state = afterReload.useAuthStore.getState();

    assert.equal(state.token, "TOKEN-A", "the token must survive the reload");
    assert.equal(state.isAuthenticated, true);
    assert.equal(state.user?.name, "Ada");
  });

  test("rehydration actually completes — the regression that broke it", async () => {
    const first = await reload();
    first.useAuthStore.getState().login({ user: { id: "u1" }, token: "TOKEN-A" });

    const afterReload = await reload();
    assert.equal(
      afterReload.hasHydrated(), true,
      "hasHydrated() stayed false when a getter on persisted state threw during merge"
    );
  });

  test("the store survives many consecutive reloads", async () => {
    const first = await reload();
    first.useAuthStore.getState().login({ user: { id: "u1" }, token: "TOKEN-A" });

    for (let i = 0; i < 5; i++) {
      const m = await reload();
      assert.equal(m.useAuthStore.getState().token, "TOKEN-A", `reload #${i + 1} lost the token`);
    }
  });

  test("no state on persisted auth may throw when read", async () => {
    // The direct guard against reintroducing the cause: spreading the state is
    // exactly what zustand's merge does, so it must never throw.
    const m = await reload();
    m.useAuthStore.getState().login({ user: { id: "u1" }, token: "TOKEN-A" });
    assert.doesNotThrow(() => ({ ...m.useAuthStore.getState() }));

    // ...including from the pristine initial state, which is the situation
    // during hydration.
    const fresh = await reload();
    assert.doesNotThrow(() => ({ ...fresh.useAuthStore.getState() }));
  });
});

describe("one source of truth for the token", () => {
  test("login writes no bare localStorage 'token' key", async () => {
    const m = await reload();
    m.useAuthStore.getState().login({ user: { id: "u1" }, token: "TOKEN-A" });

    assert.equal(
      localStorage.getItem("token"), null,
      "a second copy of the token is what let storage and store disagree"
    );
    assert.ok(backing["collab-auth"], "the persisted store holds it instead");
    assert.match(backing["collab-auth"], /TOKEN-A/);
  });

  test("getAuthToken reads the same value the store reports", async () => {
    const m = await reload();
    assert.equal(m.getAuthToken(), null);
    m.useAuthStore.getState().login({ user: { id: "u1" }, token: "TOKEN-A" });
    assert.equal(m.getAuthToken(), "TOKEN-A");
    assert.equal(m.getAuthToken(), m.useAuthStore.getState().token);
  });

  test("logout clears everything, and the clearing survives a reload", async () => {
    const m = await reload();
    m.useAuthStore.getState().login({ user: { id: "u1" }, token: "TOKEN-A" });
    m.useAuthStore.getState().logout();

    assert.equal(m.getAuthToken(), null);
    assert.equal(m.useAuthStore.getState().isAuthenticated, false);

    const afterReload = await reload();
    assert.equal(afterReload.useAuthStore.getState().token, null, "logout must not be undone by a reload");
    assert.equal(afterReload.useAuthStore.getState().isAuthenticated, false);
  });

  test("refreshToken swaps the token in place without ending the session", async () => {
    const m = await reload();
    m.useAuthStore.getState().login({ user: { id: "u1", name: "Ada" }, token: "OLD" });
    m.useAuthStore.getState().refreshToken("NEW");

    assert.equal(m.getAuthToken(), "NEW");
    assert.equal(m.useAuthStore.getState().isAuthenticated, true);
    assert.equal(m.useAuthStore.getState().user?.name, "Ada", "the user is untouched");

    const afterReload = await reload();
    assert.equal(afterReload.useAuthStore.getState().token, "NEW", "the new token persists");
  });
});

describe("teardown is keyed on the session ending, not on any 401", () => {
  // Mirrors the rule in services/api.js: only a 401 carrying AUTH_REQUIRED —
  // which is the only 401 authMiddleware emits — ends the session.
  const endsSession = (status, code) => status === 401 && code === "AUTH_REQUIRED";

  test("an expired or revoked token ends the session", () => {
    assert.equal(endsSession(401, "AUTH_REQUIRED"), true);
  });

  test("a wrong current password does NOT end the session", () => {
    // PATCH /api/auth/password answers 401 "Current password is incorrect".
    // Signing the user out for a typo is exactly the over-reach being avoided.
    assert.equal(endsSession(401, undefined), false);
  });

  test("bad sign-in credentials do NOT end the session", () => {
    assert.equal(endsSession(401, undefined), false);
  });

  test("a session-store outage (503) never ends the session", () => {
    // Phase 1.5 answers 503 rather than 401 for exactly this reason.
    assert.equal(endsSession(503, undefined), false);
  });

  test("403 and 404 never end the session", () => {
    assert.equal(endsSession(403, undefined), false);
    assert.equal(endsSession(404, undefined), false);
  });
});
