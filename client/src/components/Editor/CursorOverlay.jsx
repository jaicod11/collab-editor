/**
 * components/Editor/CursorOverlay.jsx
 * ─────────────────────────────────────────────────────────────────────────────
 * Renders each remote collaborator's cursor as a coloured blinking caret
 * with a floating name label above it.
 *
 * Positioned absolutely over the editor surface — parent must be
 * `position: relative` (EditorCore wraps this correctly).
 *
 * Props:
 *   collaborators  {Array}  — from usePresence()
 *     Each entry: { userId, name, color, cursor: { top, left } | null }
 */

// Tailwind colour map (must be full class names for purge to keep them)
const COLOR_MAP = {
  "bg-blue-400":   { bg: "#60a5fa", text: "#1e3a5f" },
  "bg-teal-400":   { bg: "#2dd4bf", text: "#0f4a42" },
  "bg-purple-400": { bg: "#c084fc", text: "#3b1a6e" },
  "bg-orange-400": { bg: "#fb923c", text: "#5c2000" },
  "bg-rose-400":   { bg: "#fb7185", text: "#5c1022" },
  "bg-indigo-400": { bg: "#818cf8", text: "#1e1b6e" },
};

function RemoteCursor({ user }) {
  if (!user.cursor) return null;
  const colors = COLOR_MAP[user.color] ?? { bg: "#60a5fa", text: "#1e3a5f" };

  return (
    <div
      className="absolute pointer-events-none z-20 transition-all duration-150 ease-out"
      style={{ top: user.cursor.top, left: user.cursor.left }}
    >
      {/* Name label */}
      <div
        className="absolute -top-6 left-0 px-1.5 py-0.5 rounded text-[10px] font-bold
                   whitespace-nowrap shadow-sm select-none"
        style={{ backgroundColor: colors.bg, color: colors.text }}
      >
        {user.name}
      </div>

      {/* Caret line */}
      <div
        className="w-[2px] h-5 animate-pulse"
        style={{ backgroundColor: colors.bg }}
      />
    </div>
  );
}

export default function CursorOverlay({ collaborators = [] }) {
  const visible = collaborators.filter((c) => c.cursor !== null);
  if (visible.length === 0) return null;

  return (
    <div
      className="absolute inset-0 pointer-events-none z-20"
      aria-hidden="true"
    >
      {visible.map((user) => (
        <RemoteCursor key={user.userId} user={user} />
      ))}
    </div>
  );
}
