/**
 * middleware/rateLimiter.js
 *
 * Limits are read from the environment so they can be tuned per deployment —
 * and so an integration suite, which legitimately makes hundreds of requests
 * from a single address, can raise the ceiling without the limiter being
 * removed from the code path it is meant to protect.
 *
 *   RATE_LIMIT_WINDOW_MS  default 900000 (15 minutes)
 *   RATE_LIMIT_MAX        default 200 requests per window per IP
 */
const rateLimit = require("express-rate-limit");

const windowMs = Number(process.env.RATE_LIMIT_WINDOW_MS ?? 15 * 60 * 1000);
const max = Number(process.env.RATE_LIMIT_MAX ?? 200);

module.exports = rateLimit({
  windowMs,
  max,
  standardHeaders: true,
  legacyHeaders: false,
  message: { message: "Too many requests, please try again later." },
});
