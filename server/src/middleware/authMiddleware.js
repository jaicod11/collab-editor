/**
 * middleware/authMiddleware.js
 * ─────────────────────────────────────────────────────────────────────────────
 * Express middleware that verifies the Bearer JWT on every protected route.
 * Attaches req.user = { id, name, email } on success.
 */

const jwt = require("jsonwebtoken");

exports.protect = (req, res, next) => {
  const header = req.headers.authorization;
  if (!header || !header.startsWith("Bearer ")) {
    return res.status(401).json({ message: "No token provided" });
  }

  const token = header.split(" ")[1];
  try {
    const payload = jwt.verify(token, process.env.JWT_SECRET);
    req.user = { id: payload.id, name: payload.name, email: payload.email };
    next();
  } catch (err) {
    const msg = err.name === "TokenExpiredError" ? "Token expired" : "Invalid token";
    return res.status(401).json({ message: msg });
  }
};
