/** @type {import('tailwindcss').Config} */
//
// Only the tokens the surviving Tailwind-styled components actually use.
//
// The live pages style themselves with inline styles and the T / E token
// objects (components/Layout/Sidebar.jsx and pages/EditorPage.jsx). Tailwind is
// now used by a handful of components only — Toast, CursorOverlay, EditorCore
// and a few page fragments — so this config previously carried 23 colour
// tokens, four font families and four keyframe animations that nothing
// referenced, left behind by components deleted in this pass.
//
// It also declared two competing accent colours: `cd-primary` (#22c55e, the
// green the app actually uses) and `primary` (#00d4ff, cyan, inherited from a
// different mock). `primary` is kept because Toast's info variant references
// it, but note the mismatch — reconciling the two palettes means restyling
// working pages, which is deliberately out of scope here.
export default {
  content: ["./index.html", "./src/**/*.{js,jsx,ts,tsx}"],
  darkMode: "class",
  theme: {
    extend: {
      colors: {
        // Referenced by Toast, CursorOverlay, EditorCore and page fragments.
        "surface": "#0d1526",
        "primary": "#00d4ff",
        // Toast's success variant. Previously referenced but never defined, so
        // success toasts rendered with no colour at all.
        "tertiary": "#22c55e",
        "surface-container-lowest": "#ffffff",
        "surface-container": "#e9edff",
        "on-surface": "#19315d",
        "on-surface-variant": "#485f8d",
        "error": "#9f403d",
      },
      fontFamily: {
        // font-headline is the only family class still in use.
        headline: ["Syne", "sans-serif"],
      },
      borderRadius: {
        sm: "4px", md: "8px", lg: "12px", xl: "16px", "2xl": "20px", full: "9999px",
      },
      animation: {
        // animate-fade-in is used by Toast.
        "fade-in": "fadeIn .2s ease both",
      },
      keyframes: {
        fadeIn: { from: { opacity: 0 }, to: { opacity: 1 } },
      },
    },
  },
  plugins: [],
};
