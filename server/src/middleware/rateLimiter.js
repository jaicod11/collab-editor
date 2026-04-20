/**
 * middleware/rateLimiter.js
 * Install: npm install express-rate-limit
 */
const rateLimit = require("express-rate-limit");

module.exports = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max:      200,             // 200 requests per window per IP
  standardHeaders: true,
  legacyHeaders:   false,
  message: { message: "Too many requests, please try again later." },
});
