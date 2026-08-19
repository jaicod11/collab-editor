/**
 * services/sessionService.js
 * ─────────────────────────────────────────────────────────────────────────────
 * Resolves whether a verified JWT payload still corresponds to a live session.
 *
 * MongoDB is the source of truth; Redis is only a fast path. Redis is a cache
 * with an eviction policy (allkeys-lru), so its keys can disappear at any time
 * for reasons that have nothing to do with authentication — a flush, a restart,
 * or simple memory pressure. Auth must never depend on cache presence.
 *
 * Resolution order:
 *   1. Redis session present AND its tokenVersion matches the token's
 *                                       → accept, no DB hit.
 *   2. No session, or a version mismatch → load the user, compare tokenVersion.
 *                                         On match, re-warm Redis and accept.
 *   3. Redis unreachable                → UNAVAILABLE. Deliberately does NOT
 *                                         fall through to the DB, so a cache
 *                                         outage cannot stampede MongoDB.
 *
 * ── Why the fast path must compare tokenVersion ──────────────────────────────
 * The session key is `session:{userId}` — one record per USER, shared by every
 * token that user holds. Accepting purely on the key's presence would mean any
 * later login re-creates the key and silently resurrects every token revoked
 * before it. The stored tokenVersion is what makes the cached record specific
 * to a generation of tokens rather than to the user.
 *
 * A mismatch falls through to MongoDB rather than rejecting outright, so the
 * durable record always has the final say.
 *
 * Revocation points still bump tokenVersion first and delete the session
 * second — the reverse order leaves a window where the DB check passes and the
 * cache is re-warmed from the stale generation. Current revocation points:
 * authController logout / changePassword / deleteAccount.
 */

const User = require("../models/User");
const redisService = require("./redisService");

const SESSION_OK = "ok";                   // token is live
const SESSION_REVOKED = "revoked";         // token is stale, or user is gone
const SESSION_UNAVAILABLE = "unavailable"; // backing store is down — cannot tell

/**
 * @param   {{ id: string, tokenVersion?: number }} payload — verified JWT payload
 * @returns {Promise<{ status: string, error?: Error }>}
 */
async function resolveSession(payload) {
  const userId = payload?.id;
  if (!userId) return { status: SESSION_REVOKED };

  const tokenVersion = payload.tokenVersion ?? 0;

  // ── 1. Fast path: cached session for THIS generation of tokens ──────────
  let session;
  try {
    session = await redisService.getSession(userId);
  } catch (err) {
    return { status: SESSION_UNAVAILABLE, error: err };
  }
  if (session && (session.tokenVersion ?? 0) === tokenVersion) {
    return { status: SESSION_OK };
  }

  // ── 2. Cache miss or stale generation — consult the durable record ──────
  let user;
  try {
    user = await User.findById(userId).select("name email tokenVersion").lean();
  } catch (err) {
    // Treated the same as a Redis outage: we cannot determine validity, so
    // report unavailable rather than rejecting a possibly-good token.
    return { status: SESSION_UNAVAILABLE, error: err };
  }

  if (!user) return { status: SESSION_REVOKED }; // account deleted

  // Tokens signed before tokenVersion existed carry no claim; treat them as 0,
  // which matches the schema default. Existing sessions therefore survive this
  // change rather than every user being logged out on deploy.
  const currentVersion = user.tokenVersion ?? 0;
  if (tokenVersion !== currentVersion) return { status: SESSION_REVOKED };

  // ── 3. Valid — re-warm the cache so subsequent requests take the fast path ──
  try {
    await redisService.setSession(userId, {
      id: user._id,
      name: user.name,
      email: user.email,
      tokenVersion: currentVersion,
    });
  } catch (err) {
    // Non-fatal: the token is valid regardless of whether we can cache it.
    console.error("[Session] Failed to re-warm session cache:", err.message);
  }

  return { status: SESSION_OK };
}

module.exports = {
  resolveSession,
  SESSION_OK,
  SESSION_REVOKED,
  SESSION_UNAVAILABLE,
};
