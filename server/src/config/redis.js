/**
 * config/redis.js
 * Creates TWO Redis clients:
 *   redisClient   — general cache (GET/SET)
 *   redisSub      — subscriber  (SUBSCRIBE)
 *   redisPub      — publisher   (PUBLISH)  — same client as redisClient is fine
 *
 * Redis pub/sub requires dedicated connections (a subscribed client
 * cannot issue normal commands).
 */

const { createClient } = require("redis");

const REDIS_URL = process.env.REDIS_URL ?? "redis://localhost:6379";

const redisClient = createClient({ url: REDIS_URL });
const redisSub    = createClient({ url: REDIS_URL });

redisClient.on("error", (e) => console.error("[Redis cache] Error:", e));
redisSub.on("error",    (e) => console.error("[Redis sub]   Error:", e));

async function connectRedis() {
  await Promise.all([redisClient.connect(), redisSub.connect()]);
  console.log("[Redis] Connected (cache + subscriber)");
}

module.exports = { redisClient, redisSub, connectRedis };
