/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,jsx,ts,tsx}"],
  darkMode: "class",
  theme: {
    extend: {
      colors: {
        // ── New Dashboard tokens (from Stitch CollabDocsHome) ───────────────
        // Used by DocumentDashboard.jsx via inline styles + tailwind classes
        "cd-bg": "#0d0d0d",
        "cd-surface": "#141414",
        "cd-fg": "#f0f0f0",
        "cd-border": "#222222",
        "cd-primary": "#22c55e",
        "cd-prim-fg": "#0d0d0d",
        "cd-sec": "#1a2e22",
        "cd-sec-fg": "#22c55e",
        "cd-muted": "#1c1c1c",
        "cd-muted-fg": "#666666",

        // ── Auth / Editor tokens (from Stitch v2 dark UI) ───────────────────
        "background": "#0a0f1e",
        "surface": "#0d1526",
        "foreground": "#e2e8f0",
        "border": "rgba(255,255,255,0.08)",
        "primary": "#00d4ff",
        "primary-fg": "#003642",
        "violet": "#7c3aed",
        "muted": "rgba(255,255,255,0.04)",
        "muted-fg": "rgba(255,255,255,0.4)",

        // ── Legacy light tokens (kept for any remaining light components) ───
        "surface-container-lowest": "#ffffff",
        "surface-container-low": "#f1f3ff",
        "surface-container": "#e9edff",
        "surface-container-high": "#e1e8ff",
        "surface-container-highest": "#d8e2ff",
        "on-surface": "#19315d",
        "on-surface-variant": "#485f8d",
        "outline": "#647aab",
        "outline-variant": "#9bb2e5",
        "error": "#9f403d",
        "on-error": "#fff7f6",
      },
      fontFamily: {
        // Geist (new dashboard) + Syne/DM Sans (landing page)
        sans: ["Geist", "DM Sans", "Inter", "sans-serif"],
        geist: ["Geist", "sans-serif"],
        syne: ["Syne", "sans-serif"],
        "dm-sans": ["DM Sans", "sans-serif"],
        headline: ["Syne", "sans-serif"],
        body: ["Geist", "DM Sans", "sans-serif"],
      },
      borderRadius: {
        sm: "4px",
        md: "8px",
        lg: "12px",
        xl: "16px",
        "2xl": "20px",
        full: "9999px",
      },
      animation: {
        "fade-up": "fadeUp .7s ease both",
        "slide-tab": "slideTab .25s ease both",
        "pulse-slow": "pulseSlow 8s ease-in-out infinite alternate",
        "spin-slow": "spin 2s linear infinite",
      },
      keyframes: {
        fadeUp: { from: { opacity: 0, transform: "translateY(28px)" }, to: { opacity: 1, transform: "translateY(0)" } },
        slideTab: { from: { opacity: 0, transform: "translateY(8px)" }, to: { opacity: 1, transform: "translateY(0)" } },
        pulseSlow: { "0%,100%": { transform: "scale(1)", opacity: .35 }, "50%": { transform: "scale(1.1)", opacity: .55 } },
      },
    },
  },
  plugins: [],
};