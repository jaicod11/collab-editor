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
    ...(isDev && { stack: err.stack }),
  });
};
