/**
 * middleware/authMiddleware.js
 * ─────────────────────────────────────────────────────────────────────────────
 * Express middleware that verifies the Bearer JWT on every protected route.
 *
 * Every 401 raised HERE carries code "AUTH_REQUIRED". That is what tells the
 * client the SESSION is finished, as opposed to an ordinary 401 from a business
 * rule — a wrong current password on the settings page, bad credentials at
 * sign-in — which must not sign anyone out. The client's response interceptor
 * keys its teardown on that code.
 * Attaches req.user = { id, name, email } on success.
 */

const jwt = require("jsonwebtoken");
const sessionService = require("../services/sessionService");

exports.protect = async (req, res, next) => {
  const header = req.headers.authorization;
  if (!header || !header.startsWith("Bearer ")) {
    return res.status(401).json({ code: "AUTH_REQUIRED", message: "No token provided" });
  }

  const token = header.split(" ")[1];

  // ── 1. Verify the signature ─────────────────────────────────────────────
  let payload;
  try {
    payload = jwt.verify(token, process.env.JWT_SECRET);
  } catch (err) {
    const msg = err.name === "TokenExpiredError" ? "Token expired" : "Invalid token";
    return res.status(401).json({ code: "AUTH_REQUIRED", message: msg });
  }

  // ── 2. Confirm the session is still live ────────────────────────────────
  // A valid signature alone is not enough: logout, a password change, and
  // account deletion all revoke outstanding tokens. Redis is consulted first,
  // but MongoDB is authoritative, so an evicted or flushed cache does not sign
  // anyone out. See services/sessionService.js.
  const { status, error } = await sessionService.resolveSession(payload);

  if (status === sessionService.SESSION_UNAVAILABLE) {
    // A backing store being down is NOT the same as the session being revoked,
    // so this fails closed with 503 rather than 401: the client's response
    // interceptor discards the token and redirects on 401, which would sign
    // every user out over a transient outage.
    console.error("[Auth] Session store unavailable:", error?.message);
    return res.status(503).json({ message: "Auth service temporarily unavailable" });
  }

  if (status !== sessionService.SESSION_OK) {
    // Deliberately generic — does not distinguish "expired", "revoked" or
    // "no such user", so the endpoint cannot be used to enumerate accounts.
    return res.status(401).json({ code: "AUTH_REQUIRED", message: "Session expired or revoked" });
  }

  req.user = { id: payload.id, name: payload.name, email: payload.email };
  next();
};
