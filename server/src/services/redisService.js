/**
 * services/redisService.js
 * ─────────────────────────────────────────────────────────────────────────────
 * All Redis read/write operations in one place.
 *
 * Key schema:
 *   doc:cache:{docId}          → JSON document object        TTL: 1 hour
 *   doc:ops:{docId}            → LIST of JSON ops            TTL: 2 hours
 *   session:{userId}           → JSON session data           TTL: 7 days
 */

const { redisClient } = require("../config/redis");

const DOC_CACHE_TTL = 60 * 60;          // 1 hour  (seconds)
const OPS_CACHE_TTL = 60 * 60 * 2;     // 2 hours
const MAX_OPS_CACHED = 500;             // keep last 500 ops per doc in Redis

// ─── Document cache ───────────────────────────────────────────────────────────

async function getDocCache(docId) {
  try {
    const raw = await redisClient.get(`doc:cache:${docId}`);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

async function setDocCache(docId, doc) {
  try {
    await redisClient.setEx(
      `doc:cache:${docId}`,
      DOC_CACHE_TTL,
      JSON.stringify(doc)
    );
  } catch (e) {
    console.error("[Redis] setDocCache error:", e);
  }
}

async function invalidateDocCache(docId) {
  await redisClient.del(`doc:cache:${docId}`);
}

// ─── Op log cache ─────────────────────────────────────────────────────────────
// Each op is stored as { op, revision } JSON in a Redis LIST.
// New ops are appended with RPUSH; we trim the list to MAX_OPS_CACHED.

async function pushOp(docId, op, revision) {
  const key = `doc:ops:${docId}`;
  try {
    await redisClient.rPush(key, JSON.stringify({ op, revision }));
    // Trim to last MAX_OPS_CACHED entries
    await redisClient.lTrim(key, -MAX_OPS_CACHED, -1);
    await redisClient.expire(key, OPS_CACHE_TTL);
  } catch (e) {
    console.error("[Redis] pushOp error:", e);
  }
}

/**
 * Return the ops array for a document between two revisions (exclusive start).
 * Returns raw op objects (not the wrapper with revision).
 *
 * If the requested range is not fully covered by Redis, returns [] and the
 * caller falls back to MongoDB.
 */
async function getOpsRange(docId, fromRevision, toRevision) {
  const key = `doc:ops:${docId}`;
  try {
    const all = await redisClient.lRange(key, 0, -1);
    const parsed = all.map((s) => JSON.parse(s));

    // Check coverage
    if (parsed.length === 0) return [];
    const minCached = parsed[0].revision;
    if (minCached > fromRevision + 1) return []; // gap — fall back to Mongo

    return parsed
      .filter((e) => e.revision > fromRevision && e.revision <= toRevision)
      .map((e) => e.op);
  } catch {
    return [];
  }
}

// ─── Session cache ────────────────────────────────────────────────────────────

async function setSession(userId, data, ttlSeconds = 60 * 60 * 24 * 7) {
  await redisClient.setEx(`session:${userId}`, ttlSeconds, JSON.stringify(data));
}

async function getSession(userId) {
  const raw = await redisClient.get(`session:${userId}`);
  return raw ? JSON.parse(raw) : null;
}

async function deleteSession(userId) {
  await redisClient.del(`session:${userId}`);
}

module.exports = {
  getDocCache,
  setDocCache,
  invalidateDocCache,
  pushOp,
  getOpsRange,
  setSession,
  getSession,
  deleteSession,
};
