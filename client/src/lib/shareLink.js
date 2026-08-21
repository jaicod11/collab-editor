/**
 * lib/shareLink.js
 * ─────────────────────────────────────────────────────────────────────────────
 * Pulls a share token out of whatever a person actually pastes.
 *
 * Share tokens are 32 CSPRNG bytes hex-encoded (see shareController), so the
 * shape is exactly 64 hex characters. Validating that here means an obviously
 * malformed paste gets a clear message instead of a navigation to a route that
 * will 404, and a well-formed but revoked token still reaches /join/:token so
 * the join page's existing "no longer valid" state handles it.
 */

/** A share token: 32 bytes, hex-encoded. */
const TOKEN_RE = /^[0-9a-f]{64}$/i;

/**
 * @param {string} input a full URL, a path, or a bare token
 * @returns {{ token: string } | { error: string }}
 */
export function extractShareToken(input) {
  const raw = String(input ?? "").trim();
  if (!raw) return { error: "Paste a share link or token." };

  // Strip anything wrapping the value: quotes, angle brackets from an email
  // client, a trailing full stop from prose.
  const cleaned = raw.replace(/^[<"'\s]+|[>"'\s.]+$/g, "");

  // 1. A bare token.
  if (TOKEN_RE.test(cleaned)) return { token: cleaned.toLowerCase() };

  // 2. Anything containing a /join/ segment — full URL, protocol-relative URL,
  //    bare path, or a link copied with surrounding text.
  const joinMatch = cleaned.match(/\/join\/([^/?#\s]+)/i);
  if (joinMatch) {
    const candidate = joinMatch[1];
    if (TOKEN_RE.test(candidate)) return { token: candidate.toLowerCase() };
    return { error: "That link does not contain a valid share token." };
  }

  // 3. A URL whose last path segment is the token, with no /join/ marker.
  const tail = cleaned.split(/[?#]/)[0].replace(/\/+$/, "").split("/").pop();
  if (tail && TOKEN_RE.test(tail)) return { token: tail.toLowerCase() };

  // 4. A token embedded in a longer string (e.g. pasted with a sentence).
  const loose = cleaned.match(/\b[0-9a-f]{64}\b/i);
  if (loose) return { token: loose[0].toLowerCase() };

  return { error: "That does not look like a share link. Paste the whole link or the token." };
}

/** The in-app route a token resolves to. */
export function joinPathFor(token) {
  return `/join/${token}`;
}
