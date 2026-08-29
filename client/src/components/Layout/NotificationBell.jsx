/**
 * components/Layout/NotificationBell.jsx
 * ─────────────────────────────────────────────────────────────────────────────
 * The bell in the sidebar header: an unread badge and a dropdown of recent
 * notifications.
 *
 * Phase 6 deleted six of these because each was a decorative SVG with a
 * hardcoded unread dot behind it — an interface asserting something untrue.
 * This one is only here because there is now a Notification collection, an
 * authenticated endpoint, and live delivery over the personal socket room.
 * The same rule still applies to the empty state: when there is nothing, it
 * says so, rather than rendering plausible-looking filler.
 *
 * Built on PortalMenu, the established dropdown in this codebase, so it is not
 * clipped by an ancestor's overflow and closes on outside click, Escape and
 * scroll for free.
 */

import { useRef, useState, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import PortalMenu from "../UI/PortalMenu";

// Local token object, matching the per-file convention used across the app.
// Deliberately not imported from Sidebar: Sidebar renders this component, and
// importing back would make the module graph circular.
const T = {
    surface: "#141414",
    fg: "#f0f0f0",
    border: "#222222",
    primary: "#22c55e",
    muted: "#1c1c1c",
    mutedFg: "#666666",
    danger: "#ef4444",
    font: "'Geist', 'DM Sans', sans-serif",
};

function BellIcon({ size = 16 }) {
    return (
        <svg xmlns="http://www.w3.org/2000/svg" width={size} height={size} viewBox="0 0 24 24"
            fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M10.268 21a2 2 0 0 0 3.464 0" />
            <path d="M3.262 15.326A1 1 0 0 0 4 17h16a1 1 0 0 0 .74-1.673C19.41 13.956 18 12.499 18 8A6 6 0 0 0 6 8c0 4.499-1.411 5.956-2.738 7.326" />
        </svg>
    );
}

/** What each notification type says, and whether its document is still reachable. */
function describe(n) {
    const who = n.payload?.actorName || "Someone";
    const title = n.payload?.docTitle || "Untitled Document";
    const role = n.payload?.role;

    switch (n.type) {
        case "access_requested":
            return { text: `${who} requested access to "${title}"`, linkable: true };
        case "access_approved":
            return {
                text: `${who} approved your access to "${title}"${role ? ` as ${role}` : ""}`,
                linkable: true,
            };
        case "access_denied":
            return { text: `${who} declined your request for "${title}"`, linkable: false };
        case "role_changed":
            return {
                text: `${who} changed your role on "${title}"${role ? ` to ${role}` : ""}`,
                linkable: true,
            };
        case "access_revoked":
            // Not linkable: following it would land on a document this user can
            // no longer open, which reads as a broken app rather than a removal.
            return { text: `${who} removed your access to "${title}"`, linkable: false };
        default:
            return { text: `Update on "${title}"`, linkable: true };
    }
}

function timeAgo(iso) {
    if (!iso) return "";
    const diff = Date.now() - new Date(iso).getTime();
    if (diff < 60_000) return "Just now";
    if (diff < 3_600_000) return `${Math.round(diff / 60_000)}m ago`;
    if (diff < 86_400_000) return `${Math.round(diff / 3_600_000)}h ago`;
    return `${Math.round(diff / 86_400_000)}d ago`;
}

function Row({ notification, onActivate }) {
    const [hover, setHover] = useState(false);
    const { text, linkable } = describe(notification);
    const unread = !notification.read;

    return (
        <button
            onClick={() => onActivate(notification, linkable)}
            onMouseEnter={() => setHover(true)}
            onMouseLeave={() => setHover(false)}
            style={{
                width: "100%", textAlign: "left", display: "flex", gap: 10, alignItems: "flex-start",
                padding: "10px 12px", background: hover ? T.muted : "none",
                border: "none", borderBottom: `1px solid ${T.border}`,
                cursor: linkable ? "pointer" : "default", fontFamily: T.font,
            }}
        >
            <span
                aria-hidden="true"
                style={{
                    width: 6, height: 6, borderRadius: "50%", marginTop: 6, flexShrink: 0,
                    background: unread ? T.primary : "transparent",
                }}
            />
            <span style={{ minWidth: 0 }}>
                <span style={{
                    display: "block", fontSize: 12.5, lineHeight: 1.45,
                    color: unread ? T.fg : T.mutedFg, fontWeight: unread ? 500 : 400,
                }}>
                    {text}
                </span>
                <span style={{ display: "block", fontSize: 11, color: T.mutedFg, marginTop: 3 }}>
                    {timeAgo(notification.createdAt)}
                </span>
            </span>
        </button>
    );
}

export default function NotificationBell({
    notifications, unreadCount, loaded, loading, onOpen, onMarkRead, onMarkAllRead,
}) {
    const btnRef = useRef(null);
    const [open, setOpen] = useState(false);
    const [hover, setHover] = useState(false);
    const navigate = useNavigate();

    const toggle = useCallback(() => {
        setOpen((prev) => {
            if (!prev) onOpen?.(); // fetch on open, not on every render of the sidebar
            return !prev;
        });
    }, [onOpen]);

    const activate = useCallback((notification, linkable) => {
        if (!notification.read) onMarkRead?.(notification._id);
        const docId = notification.payload?.docId;
        if (linkable && docId) {
            setOpen(false);
            navigate(`/editor/${docId}`);
        }
    }, [navigate, onMarkRead]);

    const badge = unreadCount > 99 ? "99+" : String(unreadCount);

    return (
        <>
            <button
                ref={btnRef}
                onClick={toggle}
                onMouseEnter={() => setHover(true)}
                onMouseLeave={() => setHover(false)}
                aria-label={unreadCount > 0 ? `Notifications, ${unreadCount} unread` : "Notifications"}
                style={{
                    position: "relative", background: "none", border: "none", padding: 4,
                    display: "flex", alignItems: "center", cursor: "pointer",
                    color: open || hover ? T.fg : T.mutedFg,
                }}
            >
                <BellIcon />
                {unreadCount > 0 && (
                    <span style={{
                        position: "absolute", top: -1, right: -3,
                        minWidth: 15, height: 15, padding: "0 4px", borderRadius: 8,
                        background: T.primary, color: "#0d0d0d",
                        fontSize: 9, fontWeight: 700, fontFamily: T.font,
                        display: "flex", alignItems: "center", justifyContent: "center",
                        border: `1.5px solid ${T.surface}`,
                    }}>
                        {badge}
                    </span>
                )}
            </button>

            {open && (
                <PortalMenu anchorRef={btnRef} onClose={() => setOpen(false)} width={320} estimatedHeight={380}>
                    <div style={{
                        display: "flex", alignItems: "center", justifyContent: "space-between",
                        padding: "10px 12px", borderBottom: `1px solid ${T.border}`,
                    }}>
                        <span style={{ fontSize: 12.5, fontWeight: 600, color: T.fg, fontFamily: T.font }}>
                            Notifications
                        </span>
                        {unreadCount > 0 && (
                            <button
                                onClick={onMarkAllRead}
                                style={{
                                    background: "none", border: "none", cursor: "pointer",
                                    fontSize: 11.5, color: T.primary, fontFamily: T.font, padding: 0,
                                }}
                            >
                                Mark all read
                            </button>
                        )}
                    </div>

                    <div style={{ maxHeight: 320, overflowY: "auto" }}>
                        {!loaded && loading && (
                            <p style={{ padding: "18px 12px", margin: 0, fontSize: 12, color: T.mutedFg, fontFamily: T.font }}>
                                Loading…
                            </p>
                        )}

                        {/* An honest empty state. Nothing is invented to fill it. */}
                        {loaded && notifications.length === 0 && (
                            <p style={{ padding: "22px 12px", margin: 0, fontSize: 12, color: T.mutedFg, fontFamily: T.font, textAlign: "center" }}>
                                No notifications yet.
                            </p>
                        )}

                        {notifications.map((n) => (
                            <Row key={n._id} notification={n} onActivate={activate} />
                        ))}
                    </div>
                </PortalMenu>
            )}
        </>
    );
}
