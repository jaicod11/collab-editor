/**
 * server/src/config/env.js
 * ─────────────────────────────────────────────────────────────────────────────
 * Validates all required environment variables at process startup.
 * Call this FIRST in server/src/index.js before anything else.
 * Fails fast with a clear error instead of a cryptic runtime crash later.
 *
 * Usage (index.js line 1):
 *   require("./config/env");
 */

const REQUIRED = [
    "MONGODB_URI",
    "REDIS_URL",
    "JWT_SECRET",
    "CLIENT_URL",
];

const OPTIONAL_WITH_DEFAULTS = {
    PORT: "4000",
    NODE_ENV: "development",
    JWT_EXPIRES: "7d",
};

// ── Apply defaults for optional vars ──────────────────────────────────────────
for (const [key, value] of Object.entries(OPTIONAL_WITH_DEFAULTS)) {
    if (!process.env[key]) {
        process.env[key] = value;
    }
}

// ── Validate required vars ────────────────────────────────────────────────────
const missing = REQUIRED.filter((key) => !process.env[key]?.trim());

if (missing.length > 0) {
    console.error("\n[Env] ✗ Missing required environment variables:");
    missing.forEach((key) => console.error(`       - ${key}`));
    console.error("\n  Copy server/.env.example → server/.env and fill in the values.\n");
    process.exit(1);
}

// ── Warn on weak JWT secret ───────────────────────────────────────────────────
if (process.env.JWT_SECRET.length < 32) {
    console.warn("[Env] ⚠ JWT_SECRET is weak — use at least 64 hex chars in production.");
}

// ── Warn if running in production with dev settings ───────────────────────────
if (process.env.NODE_ENV === "production") {
    if (process.env.MONGODB_URI?.includes("localhost")) {
        console.warn("[Env] ⚠ NODE_ENV=production but MONGODB_URI points to localhost.");
    }
    if (process.env.REDIS_URL?.includes("localhost")) {
        console.warn("[Env] ⚠ NODE_ENV=production but REDIS_URL points to localhost.");
    }
}

console.log(`[Env] ✓ All required variables present (NODE_ENV=${process.env.NODE_ENV})`);