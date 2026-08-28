/**
 * server/src/index.js — updated
 * Added workspace routes mount. Everything else is unchanged from before.
 */

// .env holds the shared/production values; .env.local (gitignored) overrides
// them for local development against infra/docker-compose.dev.yml. Loading in
// this order means a developer never has to edit .env to point at localhost.
require("dotenv").config();
require("dotenv").config({ path: `${__dirname}/../.env.local`, override: true });
require("./config/env");
const express = require("express");
const http = require("http");
const cors = require("cors");
const helmet = require("helmet");
const { Server } = require("socket.io");

const mongoose = require("mongoose");

const connectDB = require("./config/db");
const { connectRedis, redisClient, redisSub } = require("./config/redis");
const initSocket = require("./socket/socketServer");
const authRoutes = require("./routes/authRoutes");
const documentRoutes = require("./routes/documentRoutes");
const historyRoutes = require("./routes/historyRoutes");
const workspaceRoutes = require("./routes/workspaceRoutes"); // ← new
const errorHandler = require("./middleware/errorHandler");
const rateLimiter = require("./middleware/rateLimiter");

const PORT = process.env.PORT ?? 4000;
const CLIENT = process.env.CLIENT_URL ?? "http://localhost:5173";

// How long a single dependency probe may take before it counts as down.
const HEALTH_PROBE_TIMEOUT_MS = 2000;

/**
 * Run a dependency probe with a hard timeout.
 *
 * Both drivers QUEUE commands while they reconnect rather than failing fast, so
 * an un-bounded probe hangs for as long as the dependency is away — turning the
 * health endpoint itself into a hanging request and making the platform's probe
 * time out instead of reading a clean 503. Verified against a stopped Redis.
 *
 * @returns {Promise<boolean>} true only if the probe resolved truthy in time
 */
const PROBE_TIMED_OUT = Symbol("probe-timeout");

async function ping(probe) {
  let timer;
  try {
    const result = await Promise.race([
      Promise.resolve().then(probe),
      new Promise((resolve) => {
        timer = setTimeout(() => resolve(PROBE_TIMED_OUT), HEALTH_PROBE_TIMEOUT_MS);
      }),
    ]);
    return result !== PROBE_TIMED_OUT && Boolean(result);
  } catch {
    return false;
  } finally {
    clearTimeout(timer);
  }
}

async function bootstrap() {
  await connectDB();
  await connectRedis();

  const app = express();
  const server = http.createServer(app);

  // Behind Render's load balancer every request arrives from the proxy, so
  // req.ip is the proxy's address unless this is set. express-rate-limit keys
  // on IP: without it the whole internet shares one bucket and the limiter
  // either throttles everyone at once or is effectively disabled.
  //
  // `1` = trust exactly one hop (the platform proxy), which is what Render's
  // router adds. Do NOT use `true`: trusting every hop lets a client forge
  // X-Forwarded-For and evade the limiter entirely, and express-rate-limit
  // raises ERR_ERL_PERMISSIVE_TRUST_PROXY for it.
  //
  // The hop count is the one thing here that cannot be checked locally — see
  // "Verify trust proxy" in DEPLOYMENT.md for the post-deploy test. If req.ip
  // turns out to be an internal address, raise this to 2 rather than to `true`.
  app.set("trust proxy", 1);

  app.use(helmet());
  app.use(cors({ origin: CLIENT, credentials: true }));
  app.use(express.json({ limit: "2mb" }));
  app.use(rateLimiter);

  app.use("/api/auth", authRoutes);
  app.use("/api/documents", documentRoutes);
  app.use("/api/history", historyRoutes);
  app.use("/api/workspaces", workspaceRoutes); // ← new

  // ── Health check ──────────────────────────────────────────────────────────
  // Reports whether the DEPENDENCIES are reachable, not merely that the process
  // is running. A platform health check that only sees {status:"ok"} keeps an
  // instance in rotation while every request it receives 503s.
  //
  // Deliberately unauthenticated and cheap: a ping to each, no document reads.
  app.get("/health", async (_req, res) => {
    const checks = { mongo: "down", redis: "down" };

    // 1 = connected. Anything else (connecting, disconnecting, disconnected)
    // means queries will queue or fail.
    if (mongoose.connection.readyState === 1) {
      checks.mongo = (await ping(() => mongoose.connection.db.admin().command({ ping: 1 })))
        ? "up" : "down";
    }

    checks.redis = (await ping(async () => (await redisClient.ping()) === "PONG"))
      ? "up" : "down";

    const healthy = checks.mongo === "up" && checks.redis === "up";
    res.status(healthy ? 200 : 503).json({
      status: healthy ? "ok" : "degraded",
      checks,
      ts: Date.now(),
    });
  });

  app.use(errorHandler);

  const io = new Server(server, {
    cors: {
      origin: CLIENT,
      methods: ["GET", "POST"],
      credentials: true,
    },
  });

  const socketApi = initSocket(io);
  // REST handlers reach connected sockets through these rather than importing
  // io: keeps the controllers free of socket wiring and testable in isolation.
  app.set("notifyUser", socketApi.notifyUser);
  app.set("changeDocumentAccess", socketApi.changeDocumentAccess);

  server.listen(PORT, () => {
    console.log(`[Server] Listening on http://localhost:${PORT}`);
    console.log(`[Server] WebSocket ready on ws://localhost:${PORT}`);
  });

  installShutdownHandlers({ server, io });
}

/**
 * Close everything on SIGTERM, which is how a platform asks a container to stop
 * before it kills it.
 *
 * connectRedis() opens TWO clients — a command client and a subscriber, because
 * a subscribed connection cannot issue ordinary commands. Closing only one
 * leaves an open handle and the process hangs until it is force-killed (found
 * in Phase 3, where it hung a test run).
 */
function installShutdownHandlers({ server, io }) {
  let shuttingDown = false;

  const shutdown = async (signal) => {
    if (shuttingDown) return;
    shuttingDown = true;
    console.log(`[Server] ${signal} received — shutting down`);

    // Force-exit if a close hangs, so the platform's SIGKILL is never what
    // ends us (which would drop in-flight work without flushing anything).
    const failsafe = setTimeout(() => {
      console.error("[Server] Shutdown timed out — exiting");
      process.exit(1);
    }, 10_000);
    failsafe.unref();

    try {
      // Stop accepting new sockets, and disconnect existing ones so clients
      // reconnect to a healthy instance instead of holding a dead connection.
      io.close();
      await new Promise((resolve) => server.close(resolve));

      await Promise.allSettled([
        redisClient.quit(),
        redisSub.quit(),
        mongoose.disconnect(),
      ]);

      console.log("[Server] Closed cleanly");
      clearTimeout(failsafe);
      process.exit(0);
    } catch (err) {
      console.error("[Server] Error during shutdown:", err.message);
      process.exit(1);
    }
  };

  process.on("SIGTERM", () => shutdown("SIGTERM"));
  process.on("SIGINT", () => shutdown("SIGINT"));
}

bootstrap().catch((err) => {
  console.error("[Server] Fatal startup error:", err);
  process.exit(1);
});