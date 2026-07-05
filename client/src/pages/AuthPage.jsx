/**
 * pages/AuthPage.jsx — New UI (Stitch: Collab 3-scene hero + auth)
 * ─────────────────────────────────────────────────────────────────────────────
 * Faithful port of the original Stitch animation:
 *   - THREE scenes cross-fade in a continuous 15s loop (no user interaction
 *     needed): Scene 1 = presence cards, Scene 2 = live document w/ comments,
 *     Scene 3 = brand promo with stats.
 *   - Scene timing (from original @keyframes): each scene is visible for
 *     ~28% of the cycle, with a fade transition, matching opacity keyframes
 *     0%→28% visible, 28%→33% fade out, 33%→61%(scene2) visible, etc.
 *   - Individual float speeds per card (float-a/b/c/d: 4s/5s/3.5s/4.5s)
 *   - Blinking text-cursor next to live edit labels (Mia / Marcus)
 *   - Staggered slide-up entrance for Scene 3's promo text (0.2s/0.5s/0.8s/1.1s)
 *   - Scene-indicator pills on the right edge (bright = active scene)
 *
 * Clicking "Sign In" / "Get Started" scrolls down to the auth form below.
 * Design tokens: background:#141414 fg:#f0f0f0 border:#2a2a2a
 *   primary:#3dd68c primary-fg:#0d1f14 secondary:#1a2e20 muted:#222222
 *   muted-fg:#777777 card:#1a1a1a
 */

import { useState, useCallback, useRef } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import api from "../services/api";
import { useAuthStore } from "../store/authSlice";
import { useToast } from "../components/UI/Toast";

const isValidEmail = (v) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v.trim());

const C = {
  bg: "#141414", fg: "#f0f0f0", border: "#2a2a2a",
  primary: "#3dd68c", primFg: "#0d1f14", sec: "#1a2e20",
  muted: "#222222", mutedFg: "#777777", card: "#1a1a1a",
  font: "'Geist','DM Sans',sans-serif",
};

// ─── Exact animation timing from the original Stitch CSS ─────────────────────
const ANIM = `
  @keyframes scene1 { 0%{opacity:1;} 28%{opacity:1;} 33%{opacity:0;} 95%{opacity:0;} 100%{opacity:1;} }
  @keyframes scene2 { 0%{opacity:0;} 28%{opacity:0;} 33%{opacity:1;} 61%{opacity:1;} 66%{opacity:0;} 100%{opacity:0;} }
  @keyframes scene3 { 0%{opacity:0;} 61%{opacity:0;} 66%{opacity:1;} 95%{opacity:1;} 100%{opacity:0;} }
  .auth-scene-1 { animation: scene1 15s ease-in-out infinite; }
  .auth-scene-2 { animation: scene2 15s ease-in-out infinite; }
  .auth-scene-3 { animation: scene3 15s ease-in-out infinite; }

  @keyframes float-a { 0%,100%{transform:translateY(0);} 50%{transform:translateY(-8px);} }
  @keyframes float-b { 0%,100%{transform:translateY(0);} 50%{transform:translateY(-12px);} }
  @keyframes float-c { 0%,100%{transform:translateY(0);} 50%{transform:translateY(-6px);} }
  @keyframes float-d { 0%,100%{transform:translateY(0);} 50%{transform:translateY(-10px);} }
  .float-a { animation: float-a 4s ease-in-out infinite; }
  .float-b { animation: float-b 5s ease-in-out infinite 1s; }
  .float-c { animation: float-c 3.5s ease-in-out infinite .5s; }
  .float-d { animation: float-d 4.5s ease-in-out infinite 2s; }

  @keyframes blink { 0%,100%{opacity:1;} 50%{opacity:0;} }
  .cursor-blink { animation: blink 1s step-end infinite; }

  @keyframes slide-up { 0%{opacity:0;transform:translateY(20px);} 100%{opacity:1;transform:translateY(0);} }
  .promo-line-1 { animation: slide-up .7s ease forwards; animation-delay:.2s; opacity:0; }
  .promo-line-2 { animation: slide-up .7s ease forwards; animation-delay:.5s; opacity:0; }
  .promo-line-3 { animation: slide-up .7s ease forwards; animation-delay:.8s; opacity:0; }
  .promo-line-4 { animation: slide-up .7s ease forwards; animation-delay:1.1s; opacity:0; }

  @keyframes typing-dot { 0%,60%,100%{opacity:.3;} 30%{opacity:1;} }
  .typing-dot { animation: typing-dot 1.2s ease-in-out infinite; }
`;

// ═══════════════════════════ SCENE 1 — Presence cards ═════════════════════════
const SCENE1_CARDS = [
  { id: "mia", name: "Mia Tanaka", location: "Coffee shop, Tokyo", status: "Working on", doc: "Brand Guidelines v2", tag: "Design", tagColor: "#a78bfa", top: "8%", left: "6%", floatCls: "float-a", icon: "coffee" },
  { id: "ravi", name: "Ravi Patel", location: "Home, Mumbai", status: "Reviewing", doc: "Engineering Sprint #22", tag: "Engineering", tagColor: "#60a5fa", top: "4%", left: "38%", floatCls: "float-b", icon: "monitor" },
  { id: "amara", name: "Amara Osei", location: "Office, Accra", status: "Writing", doc: "User Research Synthesis", tag: "Research", tagColor: "#f59e0b", top: "5%", right: "4%", floatCls: "float-c", icon: "building-2" },
  { id: "marcus", name: "Marcus Webb", location: "Cafe, Berlin", status: "Editing", doc: "Investor Deck — Series B", tag: "Finance", tagColor: "#3dd68c", top: "48%", left: "24%", floatCls: "float-d", icon: "bar-chart-2" },
];

function Scene1Card({ card }) {
  return (
    <div className={card.floatCls} style={{
      position: "absolute", top: card.top, left: card.left, right: card.right, width: 240,
      background: C.card, border: `1px solid ${C.border}`, borderRadius: 14, padding: 16,
      boxShadow: "0 20px 50px rgba(0,0,0,.4)", zIndex: 2,
    }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 12 }}>
        <div style={{ position: "relative" }}>
          <div style={{ width: 34, height: 34, borderRadius: "50%", background: `linear-gradient(135deg,${card.tagColor},${C.primary})`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 12, fontWeight: 700, color: "#0d1f14" }}>
            {card.name.split(" ").map(n => n[0]).join("")}
          </div>
          <div style={{ position: "absolute", bottom: -1, right: -1, width: 9, height: 9, borderRadius: "50%", background: C.primary, border: `2px solid ${C.card}` }} />
        </div>
        <div>
          <p style={{ fontSize: 13, fontWeight: 600, color: C.fg, lineHeight: 1.3 }}>{card.name}</p>
          <p style={{ fontSize: 11, color: C.mutedFg, display: "flex", alignItems: "center", gap: 4 }}>
            <span style={{ width: 5, height: 5, borderRadius: "50%", background: C.primary, display: "inline-block" }} />
            {card.location}
          </p>
        </div>
      </div>
      <div style={{ background: C.muted, borderRadius: 8, padding: "8px 10px", marginBottom: 10 }}>
        <p style={{ fontSize: 10, color: C.mutedFg, marginBottom: 2 }}>{card.status}</p>
        <p style={{ fontSize: 12, fontWeight: 600, color: C.fg }}>{card.doc}</p>
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
        <span style={{ width: 6, height: 6, borderRadius: "50%", background: card.tagColor, display: "inline-block" }} />
        <span style={{ fontSize: 11, color: C.mutedFg }}>{card.tag}</span>
      </div>
    </div>
  );
}

function Scene1() {
  return (
    <div className="auth-scene-1" style={{ position: "absolute", inset: 0, overflow: "hidden", background: `linear-gradient(135deg,#0a1410 0%,#0a0a0a 50%,#0a1410 100%)` }}>
      {/* grid pattern */}
      <svg style={{ position: "absolute", inset: 0, width: "100%", height: "100%", opacity: .06 }}>
        <defs><pattern id="g1" width="60" height="60" patternUnits="userSpaceOnUse"><path d="M60 0L0 0 0 60" fill="none" stroke="#3dd68c" strokeWidth="0.5" /></pattern></defs>
        <rect width="100%" height="100%" fill="url(#g1)" />
      </svg>
      <div style={{ position: "absolute", top: "25%", left: "50%", transform: "translateX(-50%)", width: 700, height: 400, background: "radial-gradient(ellipse,rgba(61,214,140,.08) 0%,transparent 70%)" }} />

      {/* Connector lines */}
      <svg style={{ position: "absolute", inset: 0, width: "100%", height: "100%" }} preserveAspectRatio="none">
        <line x1="18%" y1="18%" x2="45%" y2="42%" stroke={C.border} strokeWidth="1" strokeDasharray="6 6" />
        <line x1="45%" y1="42%" x2="72%" y2="16%" stroke={C.border} strokeWidth="1" strokeDasharray="6 6" />
        <line x1="45%" y1="42%" x2="34%" y2="65%" stroke={C.border} strokeWidth="1" strokeDasharray="6 6" />
      </svg>

      {SCENE1_CARDS.map(c => <Scene1Card key={c.id} card={c} />)}

      {/* Center CTA */}
      <div style={{ position: "absolute", bottom: "8%", left: "50%", transform: "translateX(-50%)", textAlign: "center", zIndex: 5 }}>
        <div style={{ display: "inline-flex", alignItems: "center", gap: 8, background: "rgba(26,26,26,.9)", border: `1px solid ${C.border}`, borderRadius: 30, padding: "8px 18px", marginBottom: 20 }}>
          <div style={{ width: 7, height: 7, borderRadius: "50%", background: C.primary }} />
          <span style={{ fontSize: 13, color: C.mutedFg }}>4 teammates online across 4 cities</span>
        </div>
      </div>
    </div>
  );
}

// ═══════════════════════════ SCENE 2 — Live document ═══════════════════════════
function Scene2() {
  return (
    <div className="auth-scene-2" style={{ position: "absolute", inset: 0, overflow: "hidden", background: "linear-gradient(135deg,#08100d 0%,#0a0a0a 50%,#08100d 100%)" }}>
      <svg style={{ position: "absolute", inset: 0, width: "100%", height: "100%", opacity: .06 }}>
        <defs><pattern id="g2" width="60" height="60" patternUnits="userSpaceOnUse"><path d="M60 0L0 0 0 60" fill="none" stroke="#3dd68c" strokeWidth="0.5" /></pattern></defs>
        <rect width="100%" height="100%" fill="url(#g2)" />
      </svg>
      <div style={{ position: "absolute", top: "30%", left: "50%", transform: "translateX(-50%)", width: 700, height: 400, background: "radial-gradient(ellipse,rgba(61,214,140,.06) 0%,transparent 70%)" }} />

      {/* Document card */}
      <div style={{ position: "absolute", top: "50%", left: "50%", transform: "translate(-50%,-50%)", width: 680 }}>
        <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 12, overflow: "hidden", boxShadow: "0 0 80px rgba(61,214,140,.1), 0 24px 64px rgba(0,0,0,.7)" }}>

          {/* Doc header */}
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "12px 20px", borderBottom: `1px solid ${C.border}` }}>
            <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
              <div style={{ width: 24, height: 24, borderRadius: 6, background: C.sec, display: "flex", alignItems: "center", justifyContent: "center" }}>
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#3dd68c" strokeWidth="3.7"><path d="M6 22a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h8a2.4 2.4 0 0 1 1.7.7l3.6 3.6A2.4 2.4 0 0 1 20 8v12a2 2 0 0 1-2 2z" /><path d="M14 2v5a1 1 0 0 0 1 1h5M10 9H8m8 4H8m8 4H8" /></svg>
              </div>
              <span style={{ fontSize: 14, color: C.fg, fontWeight: 500 }}>Q3 Product Roadmap</span>
              <span style={{ fontSize: 11, padding: "2px 8px", borderRadius: 4, background: C.sec, color: "#3dd68c" }}>Product</span>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
              <span style={{ fontSize: 11, color: C.mutedFg, marginRight: 6 }}>4 editing</span>
              {["#a78bfa", "#60a5fa", "#f59e0b", "#3dd68c"].map((color, i) => (
                <div key={i} style={{ width: 22, height: 22, borderRadius: "50%", background: color, marginLeft: i > 0 ? -6 : 0, border: `2px solid ${C.card}` }} />
              ))}
            </div>
          </div>

          {/* Doc body */}
          <div style={{ padding: 24 }}>
            <h2 style={{ fontSize: 18, fontWeight: 500, color: C.fg, marginBottom: 2 }}>Q3 Product Roadmap — 2025</h2>
            <p style={{ fontSize: 11, color: C.mutedFg, marginBottom: 18 }}>Last edited 2 seconds ago · 4 collaborators</p>

            {/* Overview lines with Mia's cursor */}
            <div style={{ marginBottom: 18 }}>
              <p style={{ fontSize: 10, fontWeight: 600, color: C.mutedFg, textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 8 }}>Overview</p>
              <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                <div style={{ height: 9, background: C.muted, borderRadius: 3, width: "100%" }} />
                <div style={{ height: 9, background: C.muted, borderRadius: 3, width: "85%" }} />
                <div style={{ position: "relative" }}>
                  <div style={{ height: 9, borderRadius: 3, width: "80%", background: "rgba(167,139,250,.15)", border: "1px solid rgba(167,139,250,.3)" }} />
                  <div style={{ position: "absolute", top: -13, left: 96, display: "flex", alignItems: "center", gap: 3 }}>
                    <div className="cursor-blink" style={{ width: 2, height: 16, background: "#a78bfa" }} />
                    <span style={{ fontSize: 10, padding: "1px 6px", borderRadius: 3, background: "#a78bfa", color: "#fff" }}>Mia</span>
                  </div>
                </div>
              </div>
            </div>

            {/* Key initiatives with Marcus's cursor */}
            <div style={{ marginBottom: 18 }}>
              <p style={{ fontSize: 10, fontWeight: 600, color: C.mutedFg, textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 8 }}>Key Initiatives</p>
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <div style={{ width: 6, height: 6, borderRadius: "50%", background: "#3dd68c" }} />
                  <div style={{ height: 8, background: C.muted, borderRadius: 3, flex: 1 }} />
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 8, position: "relative" }}>
                  <div style={{ width: 6, height: 6, borderRadius: "50%", background: "#3dd68c" }} />
                  <div style={{ height: 8, borderRadius: 3, flex: 1, background: "rgba(61,214,140,.15)", border: "1px solid rgba(61,214,140,.3)" }} />
                  <div style={{ position: "absolute", top: -13, right: 32, display: "flex", alignItems: "center", gap: 3 }}>
                    <span style={{ fontSize: 10, padding: "1px 6px", borderRadius: 3, background: "#3dd68c", color: "#0d1f14" }}>Marcus</span>
                    <div className="cursor-blink" style={{ width: 2, height: 16, background: "#3dd68c" }} />
                  </div>
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <div style={{ width: 6, height: 6, borderRadius: "50%", background: C.mutedFg }} />
                  <div style={{ height: 8, background: C.muted, borderRadius: 3, width: "75%" }} />
                </div>
              </div>
            </div>

            {/* Comment */}
            <div style={{ borderLeft: "2px solid #f59e0b", paddingLeft: 12, marginBottom: 14 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 3 }}>
                <div style={{ width: 16, height: 16, borderRadius: "50%", background: "#f59e0b" }} />
                <span style={{ fontSize: 12, fontWeight: 500, color: C.fg }}>Amara</span>
                <span style={{ fontSize: 11, color: C.mutedFg }}>just now</span>
              </div>
              <p style={{ fontSize: 12, color: C.mutedFg, marginBottom: 6 }}>Should we move the launch date to Q4? Let's discuss</p>
              <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                <span style={{ fontSize: 11, color: "#3dd68c" }}>Reply</span>
                <span style={{ fontSize: 11, color: C.mutedFg }}>👍 2</span>
              </div>
            </div>

            {/* Typing indicator */}
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <div style={{ width: 20, height: 20, borderRadius: "50%", background: "#60a5fa" }} />
              <div style={{ display: "flex", alignItems: "center", gap: 3, padding: "4px 8px", borderRadius: 6, background: C.muted }}>
                {[0, .2, .4].map((d, i) => <div key={i} className="typing-dot" style={{ width: 5, height: 5, borderRadius: "50%", background: C.mutedFg, animationDelay: `${d}s` }} />)}
              </div>
              <span style={{ fontSize: 11, color: C.mutedFg }}>Ravi is typing…</span>
            </div>
          </div>
        </div>
      </div>

      {/* Corner presence chips */}
      {[
        { name: "Mia", action: "Editing overview", top: "12%", left: "6%", color: "#a78bfa" },
        { name: "Marcus", action: "Adding initiatives", top: "12%", right: "6%", color: "#3dd68c" },
        { name: "Amara", action: "Left a comment", bottom: "10%", left: "6%", color: "#f59e0b" },
        { name: "Ravi", action: "Typing…", bottom: "10%", right: "6%", color: "#60a5fa" },
      ].map((chip, i) => (
        <div key={i} style={{ position: "absolute", ...pickPos(chip), display: "flex", alignItems: "center", gap: 8, padding: "8px 12px", borderRadius: 8, border: `1px solid ${C.border}`, background: C.card }}>
          <div style={{ width: 28, height: 28, borderRadius: "50%", background: chip.color }} />
          <div>
            <p style={{ fontSize: 12, fontWeight: 500, color: C.fg }}>{chip.name}</p>
            <p style={{ fontSize: 11, color: C.mutedFg }}>{chip.action}</p>
          </div>
          <div style={{ width: 8, height: 8, borderRadius: "50%", background: chip.color, marginLeft: 4 }} />
        </div>
      ))}

      {/* Bottom badge */}
      <div style={{ position: "absolute", bottom: 24, left: "50%", transform: "translateX(-50%)" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "8px 16px", borderRadius: 30, border: `1px solid ${C.border}`, background: C.card }}>
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke={C.mutedFg} strokeWidth="4"><path d="M4 14a1 1 0 0 1-.78-1.63l9.9-10.2a.5.5 0 0 1 .86.46l-1.92 6.02A1 1 0 0 0 13 10h7a1 1 0 0 1 .78 1.63l-9.9 10.2a.5.5 0 0 1-.86-.46l1.92-6.02A1 1 0 0 0 11 14z" /></svg>
          <span style={{ fontSize: 12, color: C.mutedFg }}>Real-time collaboration — every keystroke, instantly shared</span>
        </div>
      </div>
    </div>
  );
}
function pickPos(o) {
  const p = {};
  ["top", "bottom", "left", "right"].forEach(k => { if (o[k]) p[k] = o[k]; });
  return p;
}

// ═══════════════════════════ SCENE 3 — Brand promo ═════════════════════════════
const STATS = [
  { value: "50k+", label: "Teams worldwide" },
  { value: "2M+", label: "Documents created" },
  { value: "99.9%", label: "Uptime SLA" },
  { value: "<50ms", label: "Sync latency" },
];
const BADGES = ["Real-time multi-user editing", "Inline comments & threads", "Version history & branching", "SOC 2 · End-to-end encrypted"];

function Scene3() {
  return (
    <div className="auth-scene-3" style={{ position: "absolute", inset: 0, overflow: "hidden", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", background: "linear-gradient(160deg,#060e09 0%,#0a0a0a 40%,#060e09 100%)" }}>
      <svg style={{ position: "absolute", inset: 0, width: "100%", height: "100%", opacity: .07 }}>
        <defs><pattern id="g3" width="60" height="60" patternUnits="userSpaceOnUse"><path d="M60 0L0 0 0 60" fill="none" stroke="#3dd68c" strokeWidth="0.5" /></pattern></defs>
        <rect width="100%" height="100%" fill="url(#g3)" />
      </svg>
      <div style={{ position: "absolute", top: "20%", left: "50%", transform: "translateX(-50%)", width: 800, height: 500, background: "radial-gradient(ellipse,rgba(61,214,140,.1) 0%,transparent 65%)" }} />

      <div style={{ position: "relative", zIndex: 10, textAlign: "center", padding: "0 64px" }}>
        <div className="promo-line-1" style={{ display: "inline-flex", alignItems: "center", gap: 8, padding: "6px 14px", borderRadius: 30, border: `1px solid ${C.sec}`, background: C.sec, marginBottom: 24 }}>
          <div style={{ width: 6, height: 6, borderRadius: "50%", background: C.primary }} />
          <span style={{ fontSize: 12, fontWeight: 500, color: "#3dd68c" }}>The future of team documentation</span>
        </div>

        <h1 className="promo-line-2" style={{ fontSize: 44, fontWeight: 500, color: C.fg, lineHeight: 1.15, letterSpacing: "-0.02em", marginBottom: 16 }}>
          Every idea, every teammate,<br /><span style={{ color: C.primary }}>one living document.</span>
        </h1>

        <p className="promo-line-3" style={{ fontSize: 17, color: C.mutedFg, maxWidth: 520, margin: "0 auto 40px", lineHeight: 1.6 }}>
          Collab brings your whole team into a single workspace — write, review, and ship together in real time.
        </p>

        <div className="promo-line-4" style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 40, marginBottom: 44 }}>
          {STATS.map((s) => (
            <div key={s.label} style={{ textAlign: "center" }}>
              <p style={{ fontSize: 26, fontWeight: 500, color: C.primary }}>{s.value}</p>
              <p style={{ fontSize: 11, color: C.mutedFg, marginTop: 4 }}>{s.label}</p>
            </div>
          ))}
        </div>

        <div className="promo-line-4" style={{ display: "flex", flexWrap: "wrap", alignItems: "center", justifyContent: "center", gap: 10 }}>
          {BADGES.map((b) => (
            <div key={b} style={{ display: "flex", alignItems: "center", gap: 8, padding: "8px 16px", borderRadius: 30, border: `1px solid ${C.border}`, background: C.card, fontSize: 13, color: C.mutedFg }}>
              {b}
            </div>
          ))}
        </div>
      </div>

      <div style={{ position: "absolute", bottom: 32, left: "50%", transform: "translateX(-50%)" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <div style={{ display: "flex" }}>
            {["#a78bfa", "#60a5fa", "#f59e0b", "#3dd68c"].map((color, i) => (
              <div key={i} style={{ width: 28, height: 28, borderRadius: "50%", background: color, marginLeft: i > 0 ? -8 : 0, border: `2px solid ${C.bg}` }} />
            ))}
          </div>
          <span style={{ fontSize: 12, color: C.mutedFg }}>Trusted by 50,000+ teams — <span style={{ color: C.primary }}>join for free</span></span>
        </div>
      </div>
    </div>
  );
}

// ═══════════════════════════ AUTH FORM COMPONENTS ══════════════════════════════
function Field({ label, type = "text", placeholder, value, onChange, error, icon, right, trailing }) {
  return (
    <div style={{ marginBottom: 16 }}>
      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}>
        <label style={{ fontSize: 13, color: C.mutedFg }}>{label}</label>
        {right}
      </div>
      <div style={{ position: "relative" }}>
        {icon && <span className="material-symbols-outlined" style={{ position: "absolute", left: 12, top: "50%", transform: "translateY(-50%)", fontSize: 17, color: C.mutedFg }}>{icon}</span>}
        <input type={type} value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder}
          style={{ width: "100%", background: C.muted, border: `1px solid ${error ? "#ef4444" : C.border}`, borderRadius: 8, padding: `10px 14px 10px ${icon ? 40 : 14}px`, color: C.fg, fontSize: 14, outline: "none", fontFamily: C.font, transition: "border-color .15s" }}
          onFocus={(e) => { if (!error) e.target.style.borderColor = C.primary; }}
          onBlur={(e) => { if (!error) e.target.style.borderColor = C.border; }} />
        {trailing}
      </div>
      {error && <p style={{ color: "#ef4444", fontSize: 11, marginTop: 4 }}>{error}</p>}
    </div>
  );
}

function OAuthButton({ icon, label, onClick }) {
  const [hov, setHov] = useState(false);
  return (
    <button onClick={onClick} onMouseEnter={() => setHov(true)} onMouseLeave={() => setHov(false)}
      style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", gap: 8, padding: "11px", background: hov ? "#242424" : C.muted, border: `1px solid ${C.border}`, borderRadius: 8, color: C.fg, fontSize: 13, fontWeight: 500, cursor: "pointer", fontFamily: C.font, transition: "background .15s" }}>
      {icon} {label}
    </button>
  );
}

function PasswordStrength({ password }) {
  const score = [password.length >= 8, /[A-Z]/.test(password), /[0-9]/.test(password), /[^A-Za-z0-9]/.test(password)].filter(Boolean).length;
  const colors = ["#ef4444", "#f59e0b", "#3dd68c", "#3dd68c"];
  return (
    <div style={{ display: "flex", gap: 4, marginTop: 8 }}>
      {Array.from({ length: 4 }).map((_, i) => (
        <div key={i} style={{ flex: 1, height: 3, borderRadius: 2, background: i < score ? colors[score - 1] : C.border, transition: "background .2s" }} />
      ))}
    </div>
  );
}

function GoogleIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24">
      <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4" />
      <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853" />
      <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05" />
      <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335" />
    </svg>
  );
}
function GitHubIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="#f0f0f0">
      <path d="M12 .5C5.65.5.5 5.65.5 12c0 5.08 3.29 9.39 7.86 10.91.57.1.78-.25.78-.55 0-.27-.01-1.16-.02-2.11-3.2.7-3.87-1.36-3.87-1.36-.53-1.34-1.29-1.7-1.29-1.7-1.05-.72.08-.7.08-.7 1.17.08 1.78 1.2 1.78 1.2 1.03 1.77 2.71 1.26 3.37.96.1-.75.4-1.26.73-1.55-2.55-.29-5.23-1.28-5.23-5.68 0-1.26.45-2.28 1.19-3.09-.12-.29-.52-1.46.11-3.05 0 0 .97-.31 3.18 1.18a11.1 11.1 0 0 1 5.79 0c2.2-1.49 3.17-1.18 3.17-1.18.64 1.59.24 2.76.12 3.05.74.81 1.18 1.83 1.18 3.09 0 4.41-2.69 5.39-5.25 5.67.42.36.78 1.08.78 2.17 0 1.57-.01 2.83-.01 3.22 0 .31.2.66.79.55A10.98 10.98 0 0 0 23.5 12c0-6.35-5.15-11.5-11.5-11.5z" />
    </svg>
  );
}

function SignInForm({ onOAuth }) {
  const [email, setEmail] = useState(""); const [password, setPassword] = useState("");
  const [showPw, setShowPw] = useState(false); const [errors, setErrors] = useState({});
  const [loading, setLoading] = useState(false); const [serverErr, setServerErr] = useState("");
  const login = useAuthStore(s => s.login); const navigate = useNavigate();
  const from = useLocation().state?.from ?? "/";

  const submit = async (e) => {
    e.preventDefault(); setServerErr("");
    const v = {};
    if (!isValidEmail(email)) v.email = "Enter a valid email address.";
    if (!password) v.password = "Password is required.";
    setErrors(v); if (Object.keys(v).length) return;
    setLoading(true);
    try { const { data } = await api.post("/auth/login", { email, password }); login(data); navigate(from, { replace: true }); }
    catch (err) { setServerErr(err?.response?.data?.message ?? "Invalid credentials."); }
    finally { setLoading(false); }
  };

  return (
    <form onSubmit={submit} noValidate>
      {serverErr && <div style={{ background: "rgba(239,68,68,.1)", border: "1px solid rgba(239,68,68,.25)", borderRadius: 8, padding: "10px 14px", color: "#f87171", fontSize: 13, marginBottom: 16 }}>{serverErr}</div>}
      <div style={{ display: "flex", gap: 10, marginBottom: 20 }}>
        <OAuthButton icon={<GoogleIcon />} label="Google" onClick={() => onOAuth("Google")} />
        <OAuthButton icon={<GitHubIcon />} label="GitHub" onClick={() => onOAuth("GitHub")} />
      </div>
      <div style={{ position: "relative", textAlign: "center", marginBottom: 20 }}>
        <div style={{ position: "absolute", top: "50%", left: 0, right: 0, height: 1, background: C.border }} />
        <span style={{ position: "relative", background: C.card, padding: "0 12px", fontSize: 12, color: C.mutedFg }}>or continue with email</span>
      </div>
      <Field label="Email address" type="email" placeholder="you@company.com" icon="mail" value={email} onChange={setEmail} error={errors.email} />
      <Field label="Password" type={showPw ? "text" : "password"} placeholder="Enter your password" icon="lock" value={password} onChange={setPassword} error={errors.password}
        right={<a href="#" style={{ color: C.primary, fontSize: 12, textDecoration: "none" }}>Forgot password?</a>}
        trailing={<button type="button" onClick={() => setShowPw(s => !s)} style={{ position: "absolute", right: 12, top: "50%", transform: "translateY(-50%)", background: "none", border: "none", cursor: "pointer", color: C.mutedFg, display: "flex" }}><span className="material-symbols-outlined" style={{ fontSize: 17 }}>{showPw ? "visibility_off" : "visibility"}</span></button>}
      />
      <button type="submit" disabled={loading} style={{ width: "100%", padding: "13px", background: C.primary, color: C.primFg, border: "none", borderRadius: 8, fontSize: 14, fontWeight: 700, cursor: "pointer", fontFamily: C.font, display: "flex", alignItems: "center", justifyContent: "center", gap: 8, opacity: loading ? .7 : 1, transition: "opacity .15s", marginTop: 6 }}>
        {loading ? "Signing in…" : "Sign In"}
      </button>
    </form>
  );
}

function RegisterForm({ onOAuth }) {
  const [name, setName] = useState(""); const [email, setEmail] = useState(""); const [password, setPassword] = useState("");
  const [showPw, setShowPw] = useState(false); const [agreed, setAgreed] = useState(false);
  const [errors, setErrors] = useState({}); const [loading, setLoading] = useState(false); const [serverErr, setServerErr] = useState("");
  const login = useAuthStore(s => s.login); const navigate = useNavigate();
  const from = useLocation().state?.from ?? "/";

  const submit = async (e) => {
    e.preventDefault(); setServerErr("");
    const v = {};
    if (!name.trim()) v.name = "Enter your full name.";
    if (!isValidEmail(email)) v.email = "Enter a valid work email.";
    if (password.length < 8) v.password = "Minimum 8 characters.";
    if (!agreed) v.agreed = "You must agree to continue.";
    setErrors(v); if (Object.keys(v).length) return;
    setLoading(true);
    try { const { data } = await api.post("/auth/register", { name, email, password }); login(data); navigate(from, { replace: true }); }
    catch (err) { setServerErr(err?.response?.data?.message ?? "Registration failed."); }
    finally { setLoading(false); }
  };

  return (
    <form onSubmit={submit} noValidate>
      {serverErr && <div style={{ background: "rgba(239,68,68,.1)", border: "1px solid rgba(239,68,68,.25)", borderRadius: 8, padding: "10px 14px", color: "#f87171", fontSize: 13, marginBottom: 16 }}>{serverErr}</div>}
      <div style={{ display: "flex", gap: 10, marginBottom: 20 }}>
        <OAuthButton icon={<GoogleIcon />} label="Google" onClick={() => onOAuth("Google")} />
        <OAuthButton icon={<GitHubIcon />} label="GitHub" onClick={() => onOAuth("GitHub")} />
      </div>
      <div style={{ position: "relative", textAlign: "center", marginBottom: 20 }}>
        <div style={{ position: "absolute", top: "50%", left: 0, right: 0, height: 1, background: C.border }} />
        <span style={{ position: "relative", background: C.card, padding: "0 12px", fontSize: 12, color: C.mutedFg }}>or continue with email</span>
      </div>
      <Field label="Full name" placeholder="Alex Morgan" icon="person" value={name} onChange={setName} error={errors.name} />
      <Field label="Work email" type="email" placeholder="you@company.com" icon="mail" value={email} onChange={setEmail} error={errors.email} />
      <div>
        <Field label="Password" type={showPw ? "text" : "password"} placeholder="Min. 8 characters" icon="lock" value={password} onChange={setPassword} error={errors.password}
          trailing={<button type="button" onClick={() => setShowPw(s => !s)} style={{ position: "absolute", right: 12, top: "50%", transform: "translateY(-50%)", background: "none", border: "none", cursor: "pointer", color: C.mutedFg, display: "flex" }}><span className="material-symbols-outlined" style={{ fontSize: 17 }}>{showPw ? "visibility_off" : "visibility"}</span></button>}
        />
        <PasswordStrength password={password} />
      </div>
      <label style={{ display: "flex", alignItems: "flex-start", gap: 8, marginTop: 16, marginBottom: 8, cursor: "pointer" }}>
        <input type="checkbox" checked={agreed} onChange={(e) => setAgreed(e.target.checked)} style={{ marginTop: 2, accentColor: C.primary, cursor: "pointer" }} />
        <span style={{ fontSize: 12, color: C.mutedFg, lineHeight: 1.5 }}>
          I agree to the <a href="#" style={{ color: C.primary, textDecoration: "none" }}>Terms of Service</a> and{" "}
          <a href="#" style={{ color: C.primary, textDecoration: "none" }}>Privacy Policy</a>
        </span>
      </label>
      {errors.agreed && <p style={{ color: "#ef4444", fontSize: 11, marginBottom: 12 }}>{errors.agreed}</p>}
      <button type="submit" disabled={loading} style={{ width: "100%", padding: "13px", background: C.primary, color: C.primFg, border: "none", borderRadius: 8, fontSize: 14, fontWeight: 700, cursor: "pointer", fontFamily: C.font, display: "flex", alignItems: "center", justifyContent: "center", gap: 8, opacity: loading ? .7 : 1, transition: "opacity .15s", marginTop: 8 }}>
        {loading ? "Creating account…" : <>Create free account <span className="material-symbols-outlined" style={{ fontSize: 16 }}>arrow_forward</span></>}
      </button>
    </form>
  );
}

// ═══════════════════════════ ROOT: AuthPage ════════════════════════════════════
export default function AuthPage() {
  const [view, setView] = useState("register");
  const authRef = useRef(null);
  const { toast } = useToast();

  const scrollToAuth = (targetView) => {
    setView(targetView);
    authRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  const handleOAuth = useCallback((provider) => {
    toast.info(`${provider} sign-in isn't configured yet — use email instead.`);
  }, [toast]);

  return (
    <div style={{ background: C.bg, color: C.fg, fontFamily: C.font, minHeight: "100vh" }}>
      <style>{ANIM}</style>

      {/* ═══ HERO — 3 cross-fading scenes on a 15s loop ═══ */}
      <section style={{ position: "relative", minHeight: "100vh", overflow: "hidden" }}>

        <Scene1 />
        <Scene2 />
        <Scene3 />

        {/* Navbar (always on top of scenes) */}
        <nav style={{ position: "relative", zIndex: 20, display: "flex", alignItems: "center", justifyContent: "space-between", padding: "24px 40px" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <div style={{ width: 32, height: 32, background: C.primary, borderRadius: 8, display: "flex", alignItems: "center", justifyContent: "center" }}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke={C.primFg} strokeWidth="2.4"><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" /><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z" /></svg>
            </div>
            <span style={{ fontSize: 18, fontWeight: 600, color: C.fg }}>Collab</span>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <button onClick={() => scrollToAuth("login")} style={{ padding: "9px 18px", background: C.muted, border: `1px solid ${C.border}`, borderRadius: 8, color: C.fg, fontSize: 13, fontWeight: 500, cursor: "pointer", fontFamily: C.font }}>Sign In</button>
            <button onClick={() => scrollToAuth("register")} style={{ padding: "9px 18px", background: C.primary, border: "none", borderRadius: 8, color: C.primFg, fontSize: 13, fontWeight: 700, cursor: "pointer", fontFamily: C.font }}>Get Started</button>
          </div>
        </nav>

        {/* Scene indicator pills (right edge, active scene glows) */}
        <div style={{ position: "absolute", right: 24, top: "50%", transform: "translateY(-50%)", zIndex: 20, display: "flex", flexDirection: "column", gap: 8 }}>
          <div className="auth-scene-1" style={{ width: 4, height: 32, borderRadius: 4, background: C.primary }} />
          <div className="auth-scene-2" style={{ width: 4, height: 32, borderRadius: 4, background: C.primary }} />
          <div className="auth-scene-3" style={{ width: 4, height: 32, borderRadius: 4, background: C.primary }} />
        </div>
      </section>

      {/* ═══ AUTH FORM (below the fold) ═══ */}
      <section ref={authRef} style={{ minHeight: "100vh", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: "60px 24px" }}>
        <div style={{ width: "100%", maxWidth: 440 }}>
          <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 16, padding: 32, boxShadow: "0 30px 80px rgba(0,0,0,.4)" }}>
            <div style={{ display: "flex", borderBottom: `1px solid ${C.border}`, marginBottom: 24 }}>
              {[{ key: "login", label: "Sign In" }, { key: "register", label: "Register" }].map(({ key, label }) => (
                <button key={key} onClick={() => setView(key)}
                  style={{ flex: 1, padding: "12px 0", background: "none", border: "none", borderBottom: view === key ? `2px solid ${C.primary}` : "2px solid transparent", color: view === key ? C.fg : C.mutedFg, fontSize: 14, fontWeight: 600, cursor: "pointer", fontFamily: C.font, marginBottom: -1, transition: "color .15s" }}>
                  {label}
                </button>
              ))}
            </div>
            {view === "login" ? <SignInForm onOAuth={handleOAuth} /> : <RegisterForm onOAuth={handleOAuth} />}
            <p style={{ textAlign: "center", fontSize: 13, color: C.mutedFg, marginTop: 20 }}>
              {view === "login" ? "Don't have an account? " : "Already have an account? "}
              <button onClick={() => setView(view === "login" ? "register" : "login")} style={{ background: "none", border: "none", color: C.primary, fontWeight: 600, cursor: "pointer", fontFamily: C.font, fontSize: 13 }}>
                {view === "login" ? "Sign up" : "Sign in"}
              </button>
            </p>
          </div>
          <div style={{ display: "flex", justifyContent: "center", gap: 20, marginTop: 24, flexWrap: "wrap" }}>
            {[{ icon: "verified_user", label: "SOC 2" }, { icon: "lock", label: "E2E encrypted" }, { icon: "groups", label: "50k+ teams" }].map(({ icon, label }) => (
              <div key={label} style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, color: C.mutedFg }}>
                <span className="material-symbols-outlined" style={{ fontSize: 15 }}>{icon}</span>
                {label}
              </div>
            ))}
          </div>
        </div>
      </section>
    </div>
  );
}