/**
 * components/UI/Toast.jsx
 * ─────────────────────────────────────────────────────────────────────────────
 * Lightweight toast notification system.
 *
 * Usage:
 *   1. Wrap your app in <ToastProvider> (already done in App.jsx below)
 *   2. Call useToast() in any component:
 *        const { toast } = useToast();
 *        toast.success("Document saved!");
 *        toast.error("Save failed");
 *        toast.info("3 users online");
 *
 * Toasts auto-dismiss after 3 seconds. Max 5 visible at once.
 */

import { createContext, useContext, useState, useCallback, useRef } from "react";

// ─── Context ──────────────────────────────────────────────────────────────────
const ToastContext = createContext(null);

let nextId = 1;

const ICONS = {
  success: { icon: "check_circle",    bg: "bg-tertiary/10 border-tertiary/20",   text: "text-tertiary"   },
  error:   { icon: "error",           bg: "bg-error/10 border-error/20",         text: "text-error"      },
  info:    { icon: "info",            bg: "bg-primary/10 border-primary/20",     text: "text-primary"    },
  warning: { icon: "warning",         bg: "bg-amber-500/10 border-amber-500/20", text: "text-amber-600"  },
};

// ─── Single toast ─────────────────────────────────────────────────────────────
function ToastItem({ toast: t, onDismiss }) {
  const cfg = ICONS[t.type] ?? ICONS.info;

  return (
    <div
      className={`
        flex items-start gap-3 px-4 py-3 rounded-xl border shadow-lg
        animate-fade-in max-w-sm w-full
        bg-surface-container-lowest ${cfg.bg}
      `}
    >
      <span className={`material-symbols-outlined text-sm flex-shrink-0 mt-0.5 ${cfg.text}`}>
        {cfg.icon}
      </span>
      <p className="text-sm text-on-surface flex-1 leading-snug">{t.message}</p>
      <button
        onClick={() => onDismiss(t.id)}
        className="text-on-surface-variant hover:text-on-surface transition-colors flex-shrink-0"
      >
        <span className="material-symbols-outlined text-sm">close</span>
      </button>
    </div>
  );
}

// ─── Provider ─────────────────────────────────────────────────────────────────
export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([]);
  const timers = useRef({});

  const dismiss = useCallback((id) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
    clearTimeout(timers.current[id]);
    delete timers.current[id];
  }, []);

  const add = useCallback((message, type = "info", duration = 3000) => {
    const id = nextId++;
    setToasts((prev) => [...prev.slice(-4), { id, message, type }]); // max 5
    timers.current[id] = setTimeout(() => dismiss(id), duration);
  }, [dismiss]);

  const toast = {
    success: (msg, dur) => add(msg, "success", dur),
    error:   (msg, dur) => add(msg, "error",   dur),
    info:    (msg, dur) => add(msg, "info",    dur),
    warning: (msg, dur) => add(msg, "warning", dur),
  };

  return (
    <ToastContext.Provider value={{ toast }}>
      {children}
      {/* Toast stack — bottom right */}
      <div className="fixed bottom-6 right-6 z-[200] flex flex-col gap-2 items-end pointer-events-none">
        {toasts.map((t) => (
          <div key={t.id} className="pointer-events-auto">
            <ToastItem toast={t} onDismiss={dismiss} />
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

// ─── Hook ─────────────────────────────────────────────────────────────────────
export function useToast() {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error("useToast must be used within <ToastProvider>");
  return ctx;
}
