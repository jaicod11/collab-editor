/**
 * components/Editor/ShareModal.jsx
 * ─────────────────────────────────────────────────────────────────────────────
 * Sharing and collaborator management for one document.
 *
 * What the owner sees: the share link (with enable/revoke), the collaborator
 * list with role controls and removal, and the queue of pending access
 * requests to approve or deny.
 *
 * What everyone else sees: the collaborator list, read-only, and no token.
 * The server enforces this independently — every management endpoint re-checks
 * ownership — so hiding the controls here is a convenience, not the guard.
 */

import { useState, useEffect, useCallback } from "react";
import api from "../../services/api";
import { useToast } from "../UI/Toast";

const S = {
  bg: "#1a1a1a", surface: "#222222", fg: "#e8e8e8", border: "#2e2e2e",
  primary: "#3ddc6e", primFg: "#0f1a13", muted: "#2a2a2a", mutedFg: "#7a7a7a",
  danger: "#ef4444",
  font: "'Geist','DM Sans',sans-serif",
};

const initials = (n) => (!n ? "?" : n.split(" ").map((x) => x[0]).join("").toUpperCase().slice(0, 2));

function Avatar({ name, size = 30 }) {
  return (
    <div style={{
      width: size, height: size, borderRadius: "50%", flexShrink: 0,
      background: `linear-gradient(135deg,${S.primary},#16a34a)`,
      display: "flex", alignItems: "center", justifyContent: "center",
      fontSize: size * 0.36, fontWeight: 700, color: S.primFg,
    }}>{initials(name)}</div>
  );
}

function RoleSelect({ value, disabled, onChange }) {
  return (
    <select
      value={value}
      disabled={disabled}
      onChange={(e) => onChange(e.target.value)}
      style={{
        background: S.muted, border: `1px solid ${S.border}`, color: S.fg,
        fontSize: 12, borderRadius: 5, padding: "4px 8px", outline: "none",
        fontFamily: S.font, cursor: disabled ? "not-allowed" : "pointer",
        opacity: disabled ? 0.6 : 1,
      }}
    >
      <option value="editor">Can edit</option>
      <option value="viewer">Can view</option>
    </select>
  );
}

function Btn({ children, onClick, tone = "default", disabled, title }) {
  const tones = {
    default: { bg: "none", border: `1px solid ${S.border}`, color: S.fg },
    primary: { bg: S.primary, border: "none", color: S.primFg },
    danger: { bg: "rgba(239,68,68,.1)", border: "1px solid rgba(239,68,68,.3)", color: S.danger },
  };
  const t = tones[tone];
  return (
    <button onClick={onClick} disabled={disabled} title={title}
      style={{
        padding: "6px 12px", background: t.bg, border: t.border, color: t.color,
        borderRadius: 6, fontSize: 12, fontWeight: 600, fontFamily: S.font,
        cursor: disabled ? "not-allowed" : "pointer", opacity: disabled ? 0.55 : 1,
        whiteSpace: "nowrap",
      }}>
      {children}
    </button>
  );
}

export default function ShareModal({ docId, currentUser, onClose }) {
  const { toast } = useToast();

  const [loading, setLoading] = useState(true);
  const [data, setData] = useState(null);      // { owner, collaborators, viewerRole, shareEnabled, shareLink? }
  const [requests, setRequests] = useState([]);
  const [busy, setBusy] = useState(false);

  const isOwner = data?.viewerRole === "owner";

  const load = useCallback(async () => {
    try {
      const { data: info } = await api.get(`/documents/${docId}/collaborators`);
      setData(info);
      if (info.viewerRole === "owner") {
        const { data: reqs } = await api.get(`/documents/${docId}/requests`);
        setRequests(reqs.requests ?? []);
      }
    } catch (err) {
      toast.error(err.response?.data?.message ?? "Could not load sharing settings");
    } finally {
      setLoading(false);
    }
  }, [docId, toast]);

  useEffect(() => { load(); }, [load]);

  const enableShare = async () => {
    setBusy(true);
    try {
      const { data: res } = await api.post(`/documents/${docId}/share`);
      setData((d) => ({ ...d, shareEnabled: true, shareLink: res.shareLink }));
      toast.success("Share link created");
    } catch (err) {
      toast.error(err.response?.data?.message ?? "Could not create a share link");
    } finally { setBusy(false); }
  };

  const revokeShare = async () => {
    setBusy(true);
    try {
      await api.delete(`/documents/${docId}/share`);
      setData((d) => ({ ...d, shareEnabled: false, shareLink: undefined }));
      setRequests([]);
      toast.success("Share link revoked — existing collaborators keep their access");
    } catch (err) {
      toast.error(err.response?.data?.message ?? "Could not revoke the link");
    } finally { setBusy(false); }
  };

  const copyLink = () => {
    if (!data?.shareLink) return;
    navigator.clipboard.writeText(data.shareLink)
      .then(() => toast.success("Link copied"))
      .catch(() => toast.error("Could not copy the link"));
  };

  const changeRole = async (userId, role) => {
    try {
      // Take the role the server confirms rather than the one requested, so the
      // dropdown can never show a value the server did not actually store.
      const { data: res } = await api.patch(`/documents/${docId}/collaborators/${userId}`, { role });
      const applied = res?.role ?? role;
      setData((d) => ({
        ...d,
        collaborators: d.collaborators.map((c) => (c._id === userId ? { ...c, role: applied } : c)),
      }));
      toast.success(applied === "viewer" ? "Changed to view-only" : "Changed to editor");
    } catch (err) {
      toast.error(err.response?.data?.message ?? "Could not change the role");
    }
  };

  const removeCollaborator = async (userId, name) => {
    try {
      await api.delete(`/documents/${docId}/collaborators/${userId}`);
      setData((d) => ({ ...d, collaborators: d.collaborators.filter((c) => c._id !== userId) }));
      toast.success(`${name} removed`);
    } catch (err) {
      toast.error(err.response?.data?.message ?? "Could not remove the collaborator");
    }
  };

  const decide = async (reqId, action, role) => {
    try {
      await api.post(`/documents/${docId}/requests/${reqId}/${action}`, role ? { role } : {});
      setRequests((r) => r.filter((x) => x.id !== reqId));
      if (action === "approve") { await load(); toast.success("Access granted"); }
      else toast.info("Request denied");
    } catch (err) {
      toast.error(err.response?.data?.message ?? "Could not update the request");
    }
  };

  return (
    <div
      style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,.65)", zIndex: 400, display: "flex", alignItems: "center", justifyContent: "center", padding: 20 }}
      onClick={onClose}
    >
      <div onClick={(e) => e.stopPropagation()}
        style={{ background: S.bg, border: `1px solid ${S.border}`, borderRadius: 12, width: 560, maxHeight: "85vh", overflowY: "auto", boxShadow: "0 24px 70px rgba(0,0,0,.65)", fontFamily: S.font }}>

        {/* Header */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "18px 22px", borderBottom: `1px solid ${S.border}` }}>
          <h3 style={{ fontSize: 16, fontWeight: 600, color: S.fg }}>Share document</h3>
          <button onClick={onClose} style={{ background: "none", border: "none", color: S.mutedFg, cursor: "pointer", display: "flex", padding: 4 }}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6"><path d="M18 6 6 18M6 6l12 12" /></svg>
          </button>
        </div>

        {loading ? (
          <div style={{ padding: 40, textAlign: "center", color: S.mutedFg, fontSize: 13 }}>Loading…</div>
        ) : (
          <div style={{ padding: 22 }}>

            {/* ── Share link (owner only) ─────────────────────────────── */}
            {isOwner && (
              <section style={{ marginBottom: 26 }}>
                <p style={{ fontSize: 11, fontWeight: 600, color: S.mutedFg, textTransform: "uppercase", letterSpacing: "0.09em", marginBottom: 10 }}>
                  Share link
                </p>

                {data.shareEnabled && data.shareLink ? (
                  <>
                    <div style={{ display: "flex", gap: 8, marginBottom: 10 }}>
                      <input readOnly value={data.shareLink}
                        onFocus={(e) => e.target.select()}
                        style={{ flex: 1, background: S.muted, border: `1px solid ${S.border}`, borderRadius: 6, padding: "8px 10px", color: S.fg, fontSize: 12, fontFamily: "monospace", outline: "none" }} />
                      <Btn tone="primary" onClick={copyLink}>Copy</Btn>
                    </div>
                    <p style={{ fontSize: 12, color: S.mutedFg, lineHeight: 1.6, marginBottom: 10 }}>
                      Anyone with this link can <strong style={{ color: S.fg }}>request</strong> access.
                      They will not be able to open the document until you approve them.
                    </p>
                    <Btn tone="danger" onClick={revokeShare} disabled={busy}>Revoke link</Btn>
                    <p style={{ fontSize: 11, color: S.mutedFg, marginTop: 8, lineHeight: 1.6 }}>
                      Revoking stops new requests and invalidates the link.
                      People already added below <strong style={{ color: S.fg }}>keep their access</strong> —
                      remove them individually to take it away.
                    </p>
                  </>
                ) : (
                  <>
                    <p style={{ fontSize: 12, color: S.mutedFg, lineHeight: 1.6, marginBottom: 10 }}>
                      Sharing is off. Creating a link lets people ask for access; you decide who gets in.
                    </p>
                    <Btn tone="primary" onClick={enableShare} disabled={busy}>Create share link</Btn>
                  </>
                )}
              </section>
            )}

            {/* ── Pending requests (owner only) ────────────────────────── */}
            {isOwner && requests.length > 0 && (
              <section style={{ marginBottom: 26 }}>
                <p style={{ fontSize: 11, fontWeight: 600, color: S.mutedFg, textTransform: "uppercase", letterSpacing: "0.09em", marginBottom: 10 }}>
                  Pending requests ({requests.length})
                </p>
                <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                  {requests.map((r) => (
                    <div key={r.id} style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 12px", background: S.surface, border: `1px solid ${S.border}`, borderRadius: 8 }}>
                      <Avatar name={r.name} />
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: 13, color: S.fg, fontWeight: 500 }}>{r.name}</div>
                        <div style={{ fontSize: 11, color: S.mutedFg, overflow: "hidden", textOverflow: "ellipsis" }}>
                          {r.email} · asked for {r.requestedRole === "viewer" ? "view" : "edit"} access
                        </div>
                      </div>
                      <Btn tone="primary" onClick={() => decide(r.id, "approve", r.requestedRole)}>Approve</Btn>
                      <Btn tone="danger" onClick={() => decide(r.id, "deny")}>Deny</Btn>
                    </div>
                  ))}
                </div>
              </section>
            )}

            {/* ── People with access ───────────────────────────────────── */}
            <section>
              <p style={{ fontSize: 11, fontWeight: 600, color: S.mutedFg, textTransform: "uppercase", letterSpacing: "0.09em", marginBottom: 10 }}>
                People with access
              </p>

              <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 12px", borderBottom: `1px solid ${S.border}` }}>
                <Avatar name={data.owner?.name} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 13, color: S.fg, fontWeight: 500 }}>
                    {data.owner?.name}{data.owner?._id === currentUser?.id ? " (you)" : ""}
                  </div>
                  <div style={{ fontSize: 11, color: S.mutedFg }}>{data.owner?.email}</div>
                </div>
                <span style={{ fontSize: 11, color: S.mutedFg, fontWeight: 600 }}>Owner</span>
              </div>

              {data.collaborators.length === 0 ? (
                <p style={{ fontSize: 12, color: S.mutedFg, padding: "14px 12px", fontStyle: "italic" }}>
                  No one else has access yet.
                </p>
              ) : (
                data.collaborators.map((c) => (
                  <div key={c._id} style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 12px", borderBottom: `1px solid ${S.border}` }}>
                    <Avatar name={c.name} />
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 13, color: S.fg, fontWeight: 500 }}>
                        {c.name}{c._id === currentUser?.id ? " (you)" : ""}
                      </div>
                      <div style={{ fontSize: 11, color: S.mutedFg, overflow: "hidden", textOverflow: "ellipsis" }}>{c.email}</div>
                    </div>
                    {isOwner ? (
                      <>
                        <RoleSelect value={c.role} onChange={(role) => changeRole(c._id, role)} />
                        <Btn tone="danger" onClick={() => removeCollaborator(c._id, c.name)} title="Remove access">Remove</Btn>
                      </>
                    ) : (
                      <span style={{ fontSize: 11, color: S.mutedFg, fontWeight: 600 }}>
                        {c.role === "viewer" ? "Can view" : "Can edit"}
                      </span>
                    )}
                  </div>
                ))
              )}

              {!isOwner && (
                <p style={{ fontSize: 11, color: S.mutedFg, marginTop: 12, lineHeight: 1.6 }}>
                  Only the owner can change who has access.
                </p>
              )}
            </section>
          </div>
        )}
      </div>
    </div>
  );
}
