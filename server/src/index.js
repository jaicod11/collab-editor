/**
 * server/src/index.js — updated
 * Added workspace routes mount. Everything else is unchanged from before.
 */

require("dotenv").config();
require("./config/env");
const express = require("express");
const http = require("http");
const cors = require("cors");
const helmet = require("helmet");
const { Server } = require("socket.io");

const connectDB = require("./config/db");
const { connectRedis } = require("./config/redis");
const initSocket = require("./socket/socketServer");
const authRoutes = require("./routes/authRoutes");
const documentRoutes = require("./routes/documentRoutes");
const historyRoutes = require("./routes/historyRoutes");
const workspaceRoutes = require("./routes/workspaceRoutes"); // ← new
const errorHandler = require("./middleware/errorHandler");
const rateLimiter = require("./middleware/rateLimiter");

const PORT = process.env.PORT ?? 4000;
const CLIENT = process.env.CLIENT_URL ?? "http://localhost:5173";

async function bootstrap() {
  await connectDB();
  await connectRedis();

  const app = express();
  const server = http.createServer(app);

  app.use(helmet());
  app.use(cors({ origin: CLIENT, credentials: true }));
  app.use(express.json({ limit: "2mb" }));
  app.use(rateLimiter);

  app.use("/api/auth", authRoutes);
  app.use("/api/documents", documentRoutes);
  app.use("/api/history", historyRoutes);
  app.use("/api/workspaces", workspaceRoutes); // ← new

  app.get("/health", (_req, res) => res.json({ status: "ok", ts: Date.now() }));

  app.use(errorHandler);

  const io = new Server(server, {
    cors: {
      origin: CLIENT,
      methods: ["GET", "POST"],
      credentials: true,
    },
  });

  initSocket(io);

  server.listen(PORT, () => {
    console.log(`[Server] Listening on http://localhost:${PORT}`);
    console.log(`[Server] WebSocket ready on ws://localhost:${PORT}`);
  });
}

bootstrap().catch((err) => {
  console.error("[Server] Fatal startup error:", err);
  process.exit(1);
});