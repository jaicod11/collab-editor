/**
 * pages/JoinPage.jsx
 * ─────────────────────────────────────────────────────────────────────────────
 * Landing page for a share link (/join/:token).
 *
 * A share token is permission to ASK, not access. This page therefore only ever
 * shows what the server is willing to hand out for an unresolved token — the
 * document's title and its owner's name — and never content.
 *
 * Three states, each handled explicitly:
 *   has-access → straight into the editor, no interstitial
 *   no-access  → title + owner, with a "Request access" action
 *   pending    → waiting state, no way to submit twice
 *
 * An unauthenticated visitor never reaches this component: the route is wrapped
 * in ProtectedRoute, which redirects to /auth carrying the current path, and
 * PublicRoute sends them back here after login.
 */

import { useState, useEffect, useCallback } from "react";
import { useParams, useNavigate } from "react-router-dom";
import api from "../services/api";
import { useToast } from "../components/UI/Toast";
import { useAuthStore } from "../store/authSlice";
import socketService from "../services/socket";

const T = {
  bg: "#0d0d0d", surface: "#141414", fg: "#f0f0f0", border: "#222222",
  primary: "#22c55e", primFg: "#0d0d0d", muted: "#1c1c1c", mutedFg: "#666666",
  font: "'Geist','DM Sans',sans-serif",
};

const initials = (n) => (!n ? "?" : n.split(" ").map((x) => x[0]).join("").toUpperCase().slice(0, 2));

function Shell({ children }) {
  return (
    <div style={{ minHeight: "100vh", background: T.bg, color: T.fg, fontFamily: T.font, display: "flex", alignItems: "center", justifyContent: "center", padding: 24 }}>
      <div style={{ width: 440, background: T.surface, border: `1px solid ${T.border}`, borderRadius: 14, padding: 32, boxShadow: "0 24px 70px rgba(0,0,0,.55)" }}>
        {children}
      </div>
    </div>
  );
}

function Spinner() {
  return (
    <svg style={{ animation: "spin .8s linear infinite", width: 22, height: 22, color: T.primary }} viewBox="0 0 24 24" fill="none">
      <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" style={{ opacity: .25 }} />
      <path fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" style={{ opacity: .75 }} />
    </svg>
  );
}

export default function JoinPage() {
  const { token } = useParams();
  const navigate = useNavigate();
  const { toast } = useToast();
  const currentUser = useAuthStore((s) => s.user);

  const [state, setState] = useState("loading"); // loading | no-access | pending | invalid
  const [info, setInfo] = useState(null);
  const [submitting, setSubmitting] = useState(false);

  const resolve = useCallback(async () => {
    try {
      const { data } = await api.get(`/documents/join/${token}`);
      setInfo(data);

      if (data.state === "has-access") {
        // Already a collaborator (or the owner) — skip the interstitial.
        navigate(`/editor/${data.docId}`, { replace: true });
        return;
      }
      setState(data.state); // "no-access" | "pending"
    } catch (err) {
      if (err.response?.status === 404) setState("invalid");
      else {
        setState("invalid");
        toast.error(err.response?.data?.message ?? "Could not open this link");
      }
    }
  }, [token, navigate, toast]);

  useEffect(() => { resolve(); }, [resolve]);

  // ── Real-time approval ────────────────────────────────────────────────────
  // The owner approving publishes to this user's personal room, so the waiting
  // state moves itself into the editor with no refresh and no polling.
  useEffect(() => {
    if (state !== "pending") return undefined;
    const socket = socketService.connect();

    const onGranted = ({ docId }) => {
      toast.success("Access granted");
      navigate(`/editor/${docId}`, { replace: true });
    };
    const onDenied = () => {
      toast.error("Your request was declined");
      setState("no-access");
    };

    socket.on("access:granted", onGranted);
    socket.on("access:denied", onDenied);
    return () => {
      socket.off("access:granted", onGranted);
      socket.off("access:denied", onDenied);
    };
  }, [state, navigate, toast]);

  const requestAccess = async (requestedRole) => {
    setSubmitting(true);
    try {
      const { data } = await api.post(`/documents/join/${token}`, { requestedRole });
      if (data.state === "has-access") {
        navigate(`/editor/${data.docId}`, { replace: true });
        return;
      }
      setState("pending");
      toast.success("Request sent to the owner");
    } catch (err) {
      toast.error(err.response?.data?.message ?? "Could not send the request");
    } finally {
      setSubmitting(false);
    }
  };

  // ── Render ────────────────────────────────────────────────────────────────

  if (state === "loading") {
    return (
      <Shell>
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 14, padding: "20px 0" }}>
          <Spinner />
          <p style={{ fontSize: 13, color: T.mutedFg }}>Opening share link…</p>
        </div>
        <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
      </Shell>
    );
  }

  if (state === "invalid") {
    return (
      <Shell>
        <h1 style={{ fontSize: 19, fontWeight: 600, marginBottom: 8 }}>This link is no longer valid</h1>
        <p style={{ fontSize: 13, color: T.mutedFg, lineHeight: 1.65, marginBottom: 22 }}>
          The owner may have revoked it, or it may never have existed. Ask them for a new link.
        </p>
        <button onClick={() => navigate("/")}
          style={{ padding: "9px 18px", background: T.primary, color: T.primFg, border: "none", borderRadius: 7, fontSize: 13, fontWeight: 600, cursor: "pointer", fontFamily: T.font }}>
          Back to my documents
        </button>
      </Shell>
    );
  }

  const docTitle = info?.title ?? "Untitled Document";
  const ownerName = info?.ownerName ?? "Unknown";

  return (
    <Shell>
      <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 22 }}>
        <div style={{ width: 42, height: 42, borderRadius: 10, background: T.muted, display: "flex", alignItems: "center", justifyContent: "center", color: T.primary, flexShrink: 0 }}>
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
            <path d="M6 22a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h8a2.4 2.4 0 0 1 1.704.706l3.588 3.588A2.4 2.4 0 0 1 20 8v12a2 2 0 0 1-2 2z" />
            <path d="M14 2v5a1 1 0 0 0 1 1h5" />
          </svg>
        </div>
        <div style={{ minWidth: 0 }}>
          <h1 style={{ fontSize: 17, fontWeight: 600, lineHeight: 1.3, overflow: "hidden", textOverflow: "ellipsis" }}>{docTitle}</h1>
          <div style={{ display: "flex", alignItems: "center", gap: 7, marginTop: 5 }}>
            <div style={{ width: 18, height: 18, borderRadius: "50%", background: `linear-gradient(135deg,${T.primary},#16a34a)`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 8, fontWeight: 700, color: T.primFg }}>
              {initials(ownerName)}
            </div>
            <span style={{ fontSize: 12, color: T.mutedFg }}>Owned by {ownerName}</span>
          </div>
        </div>
      </div>

      {state === "pending" ? (
        <>
          <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "12px 14px", background: "rgba(245,158,11,.08)", border: "1px solid rgba(245,158,11,.25)", borderRadius: 8, marginBottom: 18 }}>
            <Spinner />
            <div>
              <p style={{ fontSize: 13, fontWeight: 600, color: "#f59e0b" }}>Waiting for approval</p>
              <p style={{ fontSize: 12, color: T.mutedFg, marginTop: 2 }}>
                {ownerName} has been asked. This page will open the document as soon as they approve.
              </p>
            </div>
          </div>
          {/* No submit control at all in this state — there is nothing to press twice. */}
          <button onClick={() => navigate("/")}
            style={{ padding: "9px 18px", background: "none", border: `1px solid ${T.border}`, color: T.mutedFg, borderRadius: 7, fontSize: 13, cursor: "pointer", fontFamily: T.font }}>
            Back to my documents
          </button>
        </>
      ) : (
        <>
          <p style={{ fontSize: 13, color: T.mutedFg, lineHeight: 1.65, marginBottom: 20 }}>
            You do not have access to this document yet. Sending a request lets{" "}
            {ownerName} decide whether to let you in, and what you can do.
          </p>
          <div style={{ display: "flex", gap: 8 }}>
            <button onClick={() => requestAccess("editor")} disabled={submitting}
              style={{ flex: 1, padding: "10px 16px", background: T.primary, color: T.primFg, border: "none", borderRadius: 7, fontSize: 13, fontWeight: 600, cursor: submitting ? "not-allowed" : "pointer", fontFamily: T.font, opacity: submitting ? .6 : 1 }}>
              {submitting ? "Sending…" : "Request edit access"}
            </button>
            <button onClick={() => requestAccess("viewer")} disabled={submitting}
              style={{ padding: "10px 16px", background: "none", border: `1px solid ${T.border}`, color: T.fg, borderRadius: 7, fontSize: 13, fontWeight: 500, cursor: submitting ? "not-allowed" : "pointer", fontFamily: T.font, opacity: submitting ? .6 : 1 }}>
              View only
            </button>
          </div>
          <p style={{ fontSize: 11, color: T.mutedFg, marginTop: 14, lineHeight: 1.6 }}>
            Signed in as {currentUser?.name ?? "you"}.
          </p>
        </>
      )}

      <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
    </Shell>
  );
}
