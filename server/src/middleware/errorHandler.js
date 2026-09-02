/**
 * middleware/errorHandler.js
 * Global Express error handler — must be the LAST middleware registered.
 */

module.exports = function errorHandler(err, req, res, _next) {
  const isDev = process.env.NODE_ENV !== "production";

  // Mongoose validation error
  if (err.name === "ValidationError") {
    const messages = Object.values(err.errors).map((e) => e.message);
    return res.status(400).json({ message: messages.join(", ") });
  }

  // Mongoose duplicate key
  if (err.code === 11000) {
    const field = Object.keys(err.keyValue ?? {})[0] ?? "field";
    return res.status(409).json({ message: `${field} already exists` });
  }

  // Mongoose cast error (bad ObjectId)
  if (err.name === "CastError") {
    return res.status(400).json({ message: "Invalid ID format" });
  }

  const status  = err.statusCode ?? err.status ?? 500;
  const message = err.message ?? "Internal server error";

  console.error(`[Error] ${req.method} ${req.path} → ${status}: ${message}`);
  if (isDev && err.stack) console.error(err.stack);

  res.status(status).json({
    message,
    // Machine-readable code, forwarded ONLY for errors raised deliberately —
    // those carry an explicit `statusCode`. Without this, codes the services
    // already set (documentService's VIEWER_READONLY, say) were dropped here
    // and no REST client could ever act on them, while the socket path
    // delivered them fine: the same refusal was legible over one transport and
    // opaque over the other.
    //
    // The statusCode guard is what keeps incidental system errors out. A Mongo
    // driver error or an ENOENT also has a `code`, and those are internals that
    // must not travel to a client; they reach here without a statusCode and are
    // reported as a bare 500.
    ...(err.statusCode && typeof err.code === "string" ? { code: err.code } : {}),
    ...(isDev && { stack: err.stack }),
  });
};
