/**
 * client/test/share-link.test.js
 * ─────────────────────────────────────────────────────────────────────────────
 * Token extraction from whatever a person actually pastes.
 *
 * A share token is 32 CSPRNG bytes hex-encoded, so the shape is exactly 64 hex
 * characters. Validating shape here means malformed input gets a message rather
 * than a navigation to a route that will 404 — while a well-formed but revoked
 * token still reaches /join/:token, where the join page's existing "no longer
 * valid" state handles it.
 */

import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { extractShareToken, joinPathFor } from "../src/lib/shareLink.js";

const TOKEN = "a".repeat(64);
const MIXED = "AbCdEf" + "0".repeat(58);

describe("accepted paste formats", () => {
  const accepted = [
    ["a bare token", TOKEN],
    ["a full https URL", `https://collab.example.com/join/${TOKEN}`],
    ["a full http URL", `http://localhost:5173/join/${TOKEN}`],
    ["a URL with a port", `http://127.0.0.1:5173/join/${TOKEN}`],
    ["a bare path", `/join/${TOKEN}`],
    ["a path without the leading slash", `join/${TOKEN}`],
    ["a protocol-relative URL", `//collab.example.com/join/${TOKEN}`],
    ["a URL with a query string", `https://x.com/join/${TOKEN}?utm=chat`],
    ["a URL with a hash", `https://x.com/join/${TOKEN}#top`],
    ["a URL with a trailing slash", `https://x.com/join/${TOKEN}/`],
    ["surrounding whitespace", `   ${TOKEN}   `],
    ["a newline-wrapped paste", `\n${TOKEN}\n`],
    ["angle brackets from an email client", `<https://x.com/join/${TOKEN}>`],
    ["quotes", `"https://x.com/join/${TOKEN}"`],
    ["a trailing full stop from prose", `https://x.com/join/${TOKEN}.`],
    ["a link pasted inside a sentence", `here you go https://x.com/join/${TOKEN} enjoy`],
  ];

  for (const [name, input] of accepted) {
    test(name, () => {
      const result = extractShareToken(input);
      assert.equal(result.error, undefined, `${name} was rejected: ${result.error}`);
      assert.equal(result.token, TOKEN);
    });
  }

  test("uppercase hex is normalised to lowercase", () => {
    assert.equal(extractShareToken(MIXED).token, MIXED.toLowerCase());
    assert.equal(extractShareToken(`https://x.com/join/${MIXED}`).token, MIXED.toLowerCase());
  });

  test("a URL whose last segment is the token, with no /join/ marker", () => {
    assert.equal(extractShareToken(`https://x.com/documents/${TOKEN}`).token, TOKEN);
  });
});

describe("rejected input", () => {
  const rejected = [
    ["empty", ""],
    ["only whitespace", "   "],
    ["null", null],
    ["undefined", undefined],
    ["a sentence with no token", "hey can you share that doc with me"],
    ["a bare URL with no token", "https://collab.example.com/documents"],
    ["too short", "abc123"],
    ["63 hex characters", "a".repeat(63)],
    ["65 hex characters", "a".repeat(65)],
    ["64 characters that are not hex", "z".repeat(64)],
    ["a document id rather than a share token", "6a860df3a63746b1eda51efb"],
  ];

  for (const [name, input] of rejected) {
    test(name, () => {
      const result = extractShareToken(input);
      assert.ok(result.error, `${name} should have been rejected, got ${result.token}`);
      assert.equal(result.token, undefined);
      assert.match(result.error, /\S/, "the error must say something");
    });
  }

  test("a /join/ link carrying a malformed token says so specifically", () => {
    const result = extractShareToken("https://x.com/join/not-a-real-token");
    assert.match(result.error, /valid share token/i);
  });
});

describe("navigation target", () => {
  test("resolves to the existing join route, not a parallel flow", () => {
    assert.equal(joinPathFor(TOKEN), `/join/${TOKEN}`);
  });

  test("a well-formed but unknown token still routes to the join page", () => {
    // The join page owns the "this link is no longer valid" state; the input
    // must not try to decide validity itself.
    const unknown = "f".repeat(64);
    const result = extractShareToken(unknown);
    assert.equal(result.error, undefined);
    assert.equal(joinPathFor(result.token), `/join/${unknown}`);
  });
});
