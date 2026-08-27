/**
 * middleware/rateLimiter.js
 *
 * Limits are read from the environment so they can be tuned per deployment —
 * and so an integration suite, which legitimately makes hundreds of requests
 * from a single address, can raise the ceiling without the limiter being
 * removed from the code path it is meant to protect.
 *
 *   RATE_LIMIT_WINDOW_MS  default 900000 (15 minutes)
 *   RATE_LIMIT_MAX        default 1000 requests per window per IP
 *
 * ── On the default ───────────────────────────────────────────────────────────
 * It was 200 per 15 minutes, which is ~13 requests a minute. That is tight for
 * one active user (document list, opens, the history panel refetching as edits
 * land, the share modal) and the limit is keyed on IP — so an office, campus or
 * household behind a single NAT shares one bucket and twenty colleagues get
 * thirteen requests a minute between them.
 *
 * 1000 keeps the abuse ceiling meaningful while leaving room for a shared
 * egress address. Note the ceiling only covers REST: editing itself runs over
 * the WebSocket and is not counted here, so sustained typing does not consume
 * the budget.
 *
 * IP keying is inherently coarse behind shared egress. Keying on the
 * authenticated user id would be materially better for the routes behind
 * `protect`, and is the right next step if abuse becomes a real concern rather
 * than a hypothetical one.
 *
 * `trust proxy` is set in index.js — without it every request behind the
 * platform load balancer appears to come from the balancer itself and the whole
 * internet shares one bucket.
 */
const rateLimit = require("express-rate-limit");

const windowMs = Number(process.env.RATE_LIMIT_WINDOW_MS ?? 15 * 60 * 1000);
const max = Number(process.env.RATE_LIMIT_MAX ?? 1000);

module.exports = rateLimit({
  windowMs,
  max,
  standardHeaders: true,
  legacyHeaders: false,
  message: { message: "Too many requests, please try again later." },
});
