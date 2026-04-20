/**
 * components/UI/Navbar.jsx
 * ─────────────────────────────────────────────────────────────────────────────
 * Shared top navigation bar used across all pages.
 *
 * Props:
 *   title     {string}  — page/doc title shown in the nav
 *   actions   {node}    — optional right-side React nodes (buttons, avatars)
 *   showBack  {bool}    — show a back-arrow to navigate to dashboard
 */

import { useNavigate } from "react-router-dom";
import { useAuthStore } from "../../store/authSlice";

export function Navbar({ title = "CollabDocs", actions, showBack = false }) {
  const navigate   = useNavigate();
  const { user, logout } = useAuthStore();

  const handleLogout = () => {
    logout();
    navigate("/auth");
  };

  return (
    <header className="w-full sticky top-0 bg-white/80 backdrop-blur-md flex items-center justify-between px-6 py-3 shadow-[0_20px_50px_rgba(25,49,93,0.04)] z-40">
      {/* Left */}
      <div className="flex items-center gap-3">
        {showBack && (
          <button
            onClick={() => navigate("/")}
            className="p-2 rounded-lg hover:bg-surface-container-high transition-colors"
            title="Back to dashboard"
          >
            <span className="material-symbols-outlined text-on-surface-variant">arrow_back</span>
          </button>
        )}
        <span className="text-xl font-headline font-bold tracking-tight text-on-surface">
          {title}
        </span>
      </div>

      {/* Right */}
      <div className="flex items-center gap-3">
        {actions}

        {/* User menu */}
        <div className="relative group flex items-center gap-2 pl-3 border-l border-outline-variant/20 cursor-pointer">
          <div className="w-8 h-8 rounded-full bg-primary-container flex items-center justify-center text-xs font-bold text-on-primary-container select-none">
            {user?.name?.slice(0, 2).toUpperCase() ?? "?"}
          </div>
          <span className="text-sm font-semibold text-on-surface hidden sm:inline">
            {user?.name ?? "User"}
          </span>
          <span className="material-symbols-outlined text-sm text-on-surface-variant">expand_more</span>

          {/* Dropdown */}
          <div className="absolute top-10 right-0 hidden group-hover:block bg-surface-container-lowest rounded-xl shadow-lg border border-outline-variant/10 py-1 min-w-[160px] z-50">
            <div className="px-4 py-2 border-b border-outline-variant/10">
              <p className="text-xs font-bold text-on-surface truncate">{user?.name}</p>
              <p className="text-[10px] text-on-surface-variant truncate">{user?.email}</p>
            </div>
            <button
              onClick={handleLogout}
              className="w-full text-left px-4 py-2 text-sm text-error hover:bg-error/5 transition-colors flex items-center gap-2"
            >
              <span className="material-symbols-outlined text-sm">logout</span>
              Sign out
            </button>
          </div>
        </div>
      </div>
    </header>
  );
}
