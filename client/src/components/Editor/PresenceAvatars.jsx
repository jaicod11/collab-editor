/**
 * components/Editor/PresenceAvatars.jsx
 * ─────────────────────────────────────────────────────────────────────────────
 * Displays a row of overlapping avatar circles for each online collaborator,
 * with a green online dot and a tooltip on hover.
 *
 * Props:
 *   collaborators  {Array}   — from usePresence()
 *   maxVisible     {number}  — how many to show before "+N" overflow (default 4)
 */

import { useState } from "react";

const COLOR_MAP = {
  "bg-blue-400":   "bg-blue-400",
  "bg-teal-400":   "bg-teal-400",
  "bg-purple-400": "bg-purple-400",
  "bg-orange-400": "bg-orange-400",
  "bg-rose-400":   "bg-rose-400",
  "bg-indigo-400": "bg-indigo-400",
};

function Avatar({ user, size = "md" }) {
  const [showTip, setShowTip] = useState(false);
  const sz = size === "sm" ? "w-6 h-6 text-[8px]" : "w-8 h-8 text-[10px]";

  return (
    <div
      className="relative cursor-default"
      onMouseEnter={() => setShowTip(true)}
      onMouseLeave={() => setShowTip(false)}
    >
      <div
        className={`
          ${sz} rounded-full border-2 border-surface flex items-center
          justify-center font-bold text-white select-none
          ${COLOR_MAP[user.color] ?? "bg-primary-container"}
        `}
      >
        {user.initials ?? user.name?.slice(0, 2).toUpperCase()}
      </div>

      {/* Online dot */}
      <span className="absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 rounded-full bg-green-400 border-2 border-surface" />

      {/* Tooltip */}
      {showTip && (
        <div className="absolute -bottom-8 left-1/2 -translate-x-1/2 bg-inverse-surface text-inverse-on-surface text-[10px] font-medium px-2 py-1 rounded-lg whitespace-nowrap z-50 shadow-lg">
          {user.name}
        </div>
      )}
    </div>
  );
}

export default function PresenceAvatars({ collaborators = [], maxVisible = 4, size = "md" }) {
  const visible  = collaborators.slice(0, maxVisible);
  const overflow = collaborators.length - maxVisible;

  if (collaborators.length === 0) {
    return (
      <span className="text-xs text-on-surface-variant">Only you</span>
    );
  }

  return (
    <div className="flex items-center gap-2">
      <div className="flex -space-x-2">
        {visible.map((user) => (
          <Avatar key={user.userId} user={user} size={size} />
        ))}
        {overflow > 0 && (
          <div
            className={`
              ${size === "sm" ? "w-6 h-6 text-[8px]" : "w-8 h-8 text-[10px]"}
              rounded-full border-2 border-surface bg-surface-container-high
              flex items-center justify-center font-bold text-on-surface-variant
            `}
          >
            +{overflow}
          </div>
        )}
      </div>
      <span className="text-xs text-on-surface-variant font-medium hidden sm:inline">
        {collaborators.length} online
      </span>
    </div>
  );
}
