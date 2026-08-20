/**
 * client/eslint.config.js
 * ─────────────────────────────────────────────────────────────────────────────
 * ESLint 9 flat config for the React/ESM frontend.
 *
 * react-hooks/exhaustive-deps is deliberately ON. Several dependency-array bugs
 * have already been found here by hand; the linter should be the thing that
 * catches the next one. Where an effect genuinely must not re-run, the
 * suppression is written inline with a reason rather than the rule being
 * switched off globally.
 */

import js from "@eslint/js";
import globals from "globals";
import react from "eslint-plugin-react";
import reactHooks from "eslint-plugin-react-hooks";

export default [
  {
    ignores: ["node_modules/**", "dist/**", "eslint.config.js", "vite.config.js"],
  },

  js.configs.recommended,

  {
    files: ["src/**/*.{js,jsx}"],
    languageOptions: {
      ecmaVersion: 2023,
      sourceType: "module",
      globals: {
        ...globals.browser,
        ...globals.es2023,
      },
      parserOptions: {
        ecmaFeatures: { jsx: true },
      },
    },
    settings: {
      react: { version: "detect" },
    },
    plugins: {
      react,
      "react-hooks": reactHooks,
    },
    linterOptions: {
      reportUnusedDisableDirectives: "error",
    },
    rules: {
      ...react.configs.flat.recommended.rules,
      ...reactHooks.configs.recommended.rules,

      // The app uses the automatic JSX runtime via @vitejs/plugin-react, so
      // `React` need not be in scope.
      "react/react-in-jsx-scope": "off",
      "react/jsx-uses-react": "off",

      // Props are documented in JSDoc headers throughout; prop-types would be
      // noise without adding a check the JSDoc does not already give.
      "react/prop-types": "off",

      // Off deliberately, not to make the build pass. The rule exists to stop
      // stray `>` and `}` from being mistaken for JSX syntax; every hit in this
      // codebase is a quote or apostrophe inside deliberate prose
      // (`Delete "{name}"?`), which renders correctly as written. Escaping them
      // would make the copy harder to read for no correctness gain.
      "react/no-unescaped-entities": "off",

      // ── Correctness ────────────────────────────────────────────────────
      eqeqeq: ["error", "smart"],
      "no-var": "error",
      "prefer-const": ["error", { destructuring: "all" }],
      "no-constant-binary-expression": "error",
      "react-hooks/rules-of-hooks": "error",
      // WARN, not error, and deliberately left reporting. Every current hit is
      // a real dependency-array bug found in the audit, but fixing them changes
      // runtime behaviour of the React pages, which is a later phase's scope.
      // They must stay visible until then rather than being silenced.
      "react-hooks/exhaustive-deps": "warn",

      "no-unused-vars": [
        "error",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_", caughtErrors: "none" },
      ],

      "no-console": "off",
    },
  },
];
