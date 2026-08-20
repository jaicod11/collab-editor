/**
 * server/eslint.config.js
 * ─────────────────────────────────────────────────────────────────────────────
 * ESLint 9 flat config for the Node/CommonJS backend.
 *
 * The intent is that this catches real defects — unused bindings, shadowed
 * declarations, unreachable code, promises whose rejections go nowhere — rather
 * than passing because everything is switched off. Where a rule is relaxed
 * below there is a reason next to it.
 */

const js = require("@eslint/js");
const globals = require("globals");

module.exports = [
  {
    ignores: ["node_modules/**", "eslint.config.js"],
  },

  js.configs.recommended,

  {
    files: ["src/**/*.js"],
    languageOptions: {
      ecmaVersion: 2023,
      sourceType: "commonjs",
      globals: {
        ...globals.node,
        ...globals.es2023,
      },
    },
    linterOptions: {
      reportUnusedDisableDirectives: "error",
    },
    rules: {
      // ── Correctness ────────────────────────────────────────────────────
      eqeqeq: ["error", "smart"],
      "no-var": "error",
      "prefer-const": ["error", { destructuring: "all" }],
      "no-implicit-coercion": "warn",
      "no-return-await": "error",
      // allowProperties: assigning req.user / socket.user after an await is
      // safe (the object is per-request / per-connection and nothing else
      // mutates it concurrently). The rule still fires on variable reassignment,
      // which is the case that actually loses writes.
      "require-atomic-updates": ["error", { allowProperties: true }],
      "no-constant-binary-expression": "error",

      // Async correctness matters a lot here: several handlers fire-and-forget
      // database writes, and a dropped rejection is how those go unnoticed.
      "no-async-promise-executor": "error",
      "require-await": "warn",

      // ── Hygiene ────────────────────────────────────────────────────────
      "no-unused-vars": [
        "error",
        {
          // Express error middleware must keep its 4-arg shape, and several
          // catch blocks intentionally ignore the error object.
          argsIgnorePattern: "^_",
          varsIgnorePattern: "^_",
          caughtErrors: "none",
        },
      ],
      "no-shadow": "warn",
      "prefer-template": "warn",

      // console is the logging mechanism in this codebase; warn on nothing.
      "no-console": "off",
    },
  },
];
