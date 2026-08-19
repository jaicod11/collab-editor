/**
 * middleware/authMiddleware.js
 * ─────────────────────────────────────────────────────────────────────────────
 * Express middleware that verifies the Bearer JWT on every protected route.
 * Attaches req.user = { id, name, email } on success.
 */

const jwt = require("jsonwebtoken");
const redisService = require("../services/redisService");

exports.protect = async (req, res, next) => {
  const header = req.headers.authorization;
  if (!header || !header.startsWith("Bearer ")) {
    return res.status(401).json({ message: "No token provided" });
  }

  const token = header.split(" ")[1];

  // ── 1. Verify the signature ─────────────────────────────────────────────
  let payload;
  try {
    payload = jwt.verify(token, process.env.JWT_SECRET);
  } catch (err) {
    const msg = err.name === "TokenExpiredError" ? "Token expired" : "Invalid token";
    return res.status(401).json({ message: msg });
  }

  // ── 2. Confirm the session record still exists ──────────────────────────
  // A valid signature alone is not enough. logout and deleteAccount remove the
  // Redis session; without this check a revoked token stays usable for the
  // full JWT_EXPIRES window (7 days by default).
  let session;
  try {
    session = await redisService.getSession(payload.id);
  } catch (err) {
    // Redis being unreachable is NOT the same as the session being revoked, so
    // this fails closed with 503 rather than 401: the client's response
    // interceptor discards the token and redirects on 401, which would sign
    // every user out over a transient cache outage.
    console.error("[Auth] Session store unavailable:", err.message);
    return res.status(503).json({ message: "Auth service temporarily unavailable" });
  }

  if (!session) {
    return res.status(401).json({ message: "Session expired or revoked" });
  }

  req.user = { id: payload.id, name: payload.name, email: payload.email };
  next();
};
