/**
 * components/UI/OpenSharedLink.jsx
 * ─────────────────────────────────────────────────────────────────────────────
 * Paste a share link (or a bare token) and go to the join flow.
 *
 * Until now the only way to use a share link was to put it in the address bar,
 * which is awkward when the link arrives in a chat window inside the app.
 *
 * This deliberately reuses /join/:token rather than resolving the token itself:
 * the join page already handles has-access, no-access, pending and revoked, and
 * a second implementation would drift from it.
 */

import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { extractShareToken, joinPathFor } from "../../lib/shareLink";

export default function OpenSharedLink({ theme, compact = false }) {
  const navigate = useNavigate();
  const [value, setValue] = useState("");
  const [error, setError] = useState(null);

  const T = theme;

  const submit = (e) => {
    e.preventDefault();
    const result = extractShareToken(value);
    if (result.error) {
      setError(result.error);
      return;
    }
    setError(null);
    // A well-formed but revoked or unknown token still goes here: the join page
    // resolves it and shows its own "this link is no longer valid" state.
    navigate(joinPathFor(result.token));
  };

  return (
    <form onSubmit={submit} style={{ marginBottom: compact ? 20 : 28 }}>
      <div style={{ display: "flex", gap: 8, alignItems: "flex-start" }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <input
            value={value}
            onChange={(e) => { setValue(e.target.value); if (error) setError(null); }}
            placeholder="Paste a share link to open a document someone sent you"
            aria-label="Share link or token"
            aria-invalid={error ? "true" : "false"}
            style={{
              width: "100%", background: T.surface,
              border: `1px solid ${error ? "#ef4444" : T.border}`,
              borderRadius: 6, padding: "9px 12px", color: T.fg,
              fontSize: 13, fontFamily: T.font, outline: "none",
            }}
          />
          {error && (
            <p role="alert" style={{ fontSize: 12, color: "#ef4444", marginTop: 6 }}>{error}</p>
          )}
        </div>
        <button type="submit" disabled={!value.trim()}
          style={{
            padding: "9px 18px", background: T.primary, color: T.primFg,
            border: "none", borderRadius: 6, fontSize: 13, fontWeight: 600,
            cursor: value.trim() ? "pointer" : "not-allowed",
            opacity: value.trim() ? 1 : 0.5, fontFamily: T.font, whiteSpace: "nowrap",
          }}>
          Open
        </button>
      </div>
    </form>
  );
}
