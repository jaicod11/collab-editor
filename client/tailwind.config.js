// client/tailwind.config.js
/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,jsx,ts,tsx}"],
  darkMode: "class",
  theme: {
    extend: {
      colors: {
        // ── Stitch design tokens (unified from all three Stitch outputs) ──
        "surface-container-lowest":  "#ffffff",
        "surface-container-low":     "#f1f3ff",
        "surface-container":         "#e9edff",
        "surface-container-high":    "#e1e8ff",
        "surface-container-highest": "#d8e2ff",
        "surface-bright":            "#f9f9ff",
        "surface-dim":               "#ccdaff",
        "surface-variant":           "#d8e2ff",
        "surface":                   "#f9f9ff",
        "background":                "#f9f9ff",
        "on-background":             "#19315d",
        "on-surface":                "#19315d",
        "on-surface-variant":        "#485f8d",
        "inverse-surface":           "#070e1d",
        "inverse-on-surface":        "#969db0",

        "primary":                   "#565e74",
        "primary-container":         "#dae2fd",
        "primary-fixed":             "#dae2fd",
        "primary-fixed-dim":         "#ccd4ee",
        "primary-dim":               "#4a5268",
        "on-primary":                "#f7f7ff",
        "on-primary-container":      "#4a5167",
        "on-primary-fixed":          "#373f54",
        "on-primary-fixed-variant":  "#535b71",
        "inverse-primary":           "#dae2fd",
        "surface-tint":              "#565e74",

        "secondary":                 "#006b62",
        "secondary-container":       "#89f5e7",
        "secondary-fixed":           "#89f5e7",
        "secondary-fixed-dim":       "#7ae7d8",
        "secondary-dim":             "#005e56",
        "on-secondary":              "#e2fff9",
        "on-secondary-container":    "#005c54",
        "on-secondary-fixed":        "#004841",
        "on-secondary-fixed-variant":"#00675e",

        "tertiary":                  "#006e2f",
        "tertiary-container":        "#6bff8f",
        "tertiary-fixed":            "#6bff8f",
        "tertiary-fixed-dim":        "#5bf083",
        "tertiary-dim":              "#006128",
        "on-tertiary":               "#e9ffe6",
        "on-tertiary-container":     "#005f28",
        "on-tertiary-fixed":         "#004a1d",
        "on-tertiary-fixed-variant": "#006a2d",

        "outline":                   "#647aab",
        "outline-variant":           "#9bb2e5",

        "error":                     "#9f403d",
        "error-container":           "#fe8983",
        "error-dim":                 "#4e0309",
        "on-error":                  "#fff7f6",
        "on-error-container":        "#752121",
      },
      borderRadius: {
        DEFAULT: "0.125rem",
        lg:      "0.25rem",
        xl:      "0.5rem",
        full:    "0.75rem",
      },
      fontFamily: {
        headline: ["Manrope", "sans-serif"],
        body:     ["Inter", "sans-serif"],
        label:    ["Inter", "sans-serif"],
        sans:     ["Inter", "sans-serif"],
      },
      animation: {
        "fade-in": "fadeIn 0.15s ease",
      },
      keyframes: {
        fadeIn: { from: { opacity: 0, transform: "translateY(-4px)" }, to: { opacity: 1 } },
      },
    },
  },
  plugins: [],
};
