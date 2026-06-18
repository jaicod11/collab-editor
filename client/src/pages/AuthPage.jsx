/**
 * pages/AuthPage.jsx — Upgraded Landing + Auth Page
 *
 * Layout:
 *  1. Fixed navbar
 *  2. Hero section — headline, subtext, two CTAs → scrolls to auth card
 *  3. Stats bar — 3 live numbers
 *  4. Features section — 6 feature cards
 *  5. How it works — 3 steps
 *  6. Auth card — Sign In / Register (no Google OAuth)
 *  7. Footer
 *
 * Design: deep dark (#080c14), teal (#00d4ff) + violet (#7c3aed) accent,
 * Syne display font, DM Sans body, animated orbs, dot grid, scroll fade-ins.
 */

import { useState, useCallback, useEffect, useRef } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import api from "../services/api";
import { useAuthStore } from "../store/authSlice";

const isValidEmail = (v) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v.trim());

/* ─── Global styles injected once ─────────────────────────────────────── */
const STYLES = `
  @import url('https://fonts.googleapis.com/css2?family=Syne:wght@700;800&family=DM+Sans:wght@400;500;600&display=swap');

  :root {
    --bg:      #080c14;
    --card:    rgba(255,255,255,.04);
    --border:  rgba(255,255,255,.08);
    --teal:    #00d4ff;
    --violet:  #7c3aed;
    --text:    #e2e8f0;
    --muted:   rgba(255,255,255,.4);
  }

  * { box-sizing: border-box; margin: 0; padding: 0; }

  body { background: var(--bg); color: var(--text); font-family: 'DM Sans', sans-serif; }

  @keyframes orb-drift {
    0%,100% { transform: translate(0,0) scale(1);          opacity:.5; }
    33%      { transform: translate(40px,-60px) scale(1.15); opacity:.35;}
    66%      { transform: translate(-30px,40px) scale(.9);   opacity:.6; }
  }
  @keyframes fade-up {
    from { opacity:0; transform:translateY(28px); }
    to   { opacity:1; transform:translateY(0);    }
  }
  @keyframes pulse-dot {
    0%,100% { box-shadow: 0 0 0 0 rgba(0,212,255,.6); }
    50%     { box-shadow: 0 0 0 8px rgba(0,212,255,0); }
  }
  @keyframes count-up {
    from { opacity:0; transform:scale(.8); }
    to   { opacity:1; transform:scale(1);  }
  }
  @keyframes slide-tab {
    from { opacity:0; transform:translateY(8px); }
    to   { opacity:1; transform:translateY(0);   }
  }
  @keyframes spin { to { transform:rotate(360deg); } }
  @keyframes shimmer-line {
    0%   { background-position:-200% 0; }
    100% { background-position:200% 0;  }
  }

  .orb { position:absolute; border-radius:50%; filter:blur(110px); animation:orb-drift ease-in-out infinite; }
  .dot-grid { background-image:radial-gradient(rgba(255,255,255,.05) 1px,transparent 1px); background-size:28px 28px; }
  .glass { background:var(--card); backdrop-filter:blur(24px); border:1px solid var(--border); }
  .fade-in { animation:fade-up .7s ease both; }
  .gradient-text {
    background:linear-gradient(135deg,var(--teal),#a78bfa,var(--teal));
    background-size:200%;
    -webkit-background-clip:text; -webkit-text-fill-color:transparent;
    animation:shimmer-line 4s linear infinite;
  }
  .feature-card:hover {
    border-color:rgba(0,212,255,.25)!important;
    transform:translateY(-4px);
    box-shadow:0 20px 50px rgba(0,212,255,.08);
  }
  .feature-card { transition:all .3s ease; }
  .step-line::before {
    content:''; position:absolute; top:24px; left:calc(50% + 28px);
    width:calc(100% - 56px); height:1px;
    background:linear-gradient(to right,rgba(0,212,255,.3),transparent);
  }
  .btn-primary {
    background:linear-gradient(135deg,var(--teal),var(--violet));
    color:#fff; font-weight:700; border:none; cursor:pointer;
    transition:transform .2s,box-shadow .2s;
  }
  .btn-primary:hover { transform:scale(1.03); box-shadow:0 8px 30px rgba(0,212,255,.35); }
  .btn-primary:active { transform:scale(.97); }
  .btn-primary:disabled { opacity:.6; cursor:not-allowed; transform:none; }
  .btn-outline {
    background:transparent; border:1px solid var(--border);
    color:var(--text); cursor:pointer; font-weight:600;
    transition:border-color .2s,background .2s;
  }
  .btn-outline:hover { border-color:rgba(0,212,255,.4); background:rgba(0,212,255,.05); }
  .input-field {
    width:100%; background:rgba(255,255,255,.04);
    border:none; border-bottom:2px solid rgba(255,255,255,.1);
    color:var(--text); outline:none; font-family:'DM Sans',sans-serif;
    transition:border-color .2s;
  }
  .input-field:focus { border-color:var(--teal); }
  .input-field::placeholder { color:rgba(255,255,255,.25); }
  .tab-active { color:#fff; position:relative; }
  .tab-active::after {
    content:''; position:absolute; bottom:-4px; left:0; width:100%; height:2px;
    background:var(--teal); box-shadow:0 0 10px var(--teal);
  }
  .tab-inactive { color:var(--muted); cursor:pointer; }
  .tab-inactive:hover { color:rgba(255,255,255,.7); }
  .scroll-section { opacity:0; transform:translateY(30px); transition:opacity .7s ease, transform .7s ease; }
  .scroll-section.visible { opacity:1; transform:translateY(0); }
  ::-webkit-scrollbar { width:4px; } ::-webkit-scrollbar-thumb { background:rgba(255,255,255,.1); border-radius:4px; }
  ::selection { background:rgba(0,212,255,.25); }
`;

/* ─── FEATURES data ────────────────────────────────────────────────────── */
const FEATURES = [
  { icon: "bolt", title: "Sub-50ms Sync", desc: "Operational Transformation engine resolves every conflict in under 50 milliseconds — edits appear instantly across all connected clients." },
  { icon: "group", title: "Live Cursors", desc: "See every collaborator's cursor and selection in real time. Colour-coded presence avatars show exactly who is editing what." },
  { icon: "history", title: "Version History", desc: "Full operation log with point-in-time restore. Replay any snapshot and bring a document back to exactly how it was." },
  { icon: "lock", title: "JWT Auth", desc: "Secure token-based authentication with bcrypt password hashing. Sessions stored in Redis with automatic expiry." },
  { icon: "hub", title: "Redis Pub/Sub", desc: "Multi-node horizontal scaling via Redis pub/sub. Add more server instances behind Nginx — zero downtime, zero data loss." },
  { icon: "description", title: "Smart Documents", desc: "Auto-save, archive, search by content, collaborator management, and status tracking — everything a modern document needs." },
];

/* ─── HOW IT WORKS ─────────────────────────────────────────────────────── */
const STEPS = [
  { n: "01", title: "Create a document", desc: "Hit the + button. Your document is live in under a second and ready to share." },
  { n: "02", title: "Share the link", desc: "Copy the editor URL and send it. Anyone with the link and an account can join instantly." },
  { n: "03", title: "Edit together", desc: "Type simultaneously. OT handles every conflict — no overwrites, no lost work, ever." },
];

/* ─── STATS ─────────────────────────────────────────────────────────────── */
const STATS = [
  { value: "< 50ms", label: "Edit latency" },
  { value: "∞", label: "Concurrent editors" },
  { value: "100%", label: "Conflict-free merges" },
];

/* ─── Scroll observer hook ──────────────────────────────────────────────── */
function useScrollReveal() {
  useEffect(() => {
    const els = document.querySelectorAll(".scroll-section");
    const io = new IntersectionObserver(
      (entries) => entries.forEach((e) => { if (e.isIntersecting) e.target.classList.add("visible"); }),
      { threshold: 0.12 }
    );
    els.forEach((el) => io.observe(el));
    return () => io.disconnect();
  }, []);
}

/* ─── Field ─────────────────────────────────────────────────────────────── */
function Field({ label, type = "text", placeholder, value, onChange, error, icon, right }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end" }}>
        <label style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.1em", color: "var(--muted)" }}>{label}</label>
        {right}
      </div>
      <div style={{ position: "relative" }}>
        {icon && (
          <span className="material-symbols-outlined" style={{ position: "absolute", left: 12, top: "50%", transform: "translateY(-50%)", color: "rgba(255,255,255,.3)", fontSize: 18 }}>
            {icon}
          </span>
        )}
        <input
          type={type} value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          className="input-field"
          style={{ padding: icon ? "12px 12px 12px 40px" : "12px 12px", fontSize: 14, borderRadius: 0 }}
        />
      </div>
      {error && <p style={{ color: "#f87171", fontSize: 11, fontWeight: 600 }}>{error}</p>}
    </div>
  );
}

/* ─── Spinner ───────────────────────────────────────────────────────────── */
function Spinner() {
  return (
    <svg style={{ animation: "spin .8s linear infinite", width: 16, height: 16 }} viewBox="0 0 24 24" fill="none">
      <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" style={{ opacity: .25 }} />
      <path fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" style={{ opacity: .75 }} />
    </svg>
  );
}

/* ─── Login Form ────────────────────────────────────────────────────────── */
function LoginForm({ onSwitch }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [errors, setErrors] = useState({});
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState("");
  const login = useAuthStore((s) => s.login);
  const navigate = useNavigate();
  const from = useLocation().state?.from ?? "/";

  const submit = async (e) => {
    e.preventDefault(); setErr("");
    const v = {};
    if (!isValidEmail(email)) v.email = "Enter a valid email.";
    if (!password) v.password = "Password is required.";
    setErrors(v);
    if (Object.keys(v).length) return;
    setLoading(true);
    try {
      const { data } = await api.post("/auth/login", { email, password });
      login(data); navigate(from, { replace: true });
    } catch (ex) { setErr(ex?.response?.data?.message ?? "Invalid credentials."); }
    finally { setLoading(false); }
  };

  return (
    <form onSubmit={submit} noValidate style={{ display: "flex", flexDirection: "column", gap: 20, animation: "slide-tab .25s ease both" }}>
      {err && (
        <div style={{ background: "rgba(248,113,113,.1)", border: "1px solid rgba(248,113,113,.25)", borderRadius: 10, padding: "12px 16px", color: "#f87171", fontSize: 13 }}>
          {err}
        </div>
      )}
      <Field label="Email Address" type="email" placeholder="name@company.com" icon="mail"
        value={email} onChange={setEmail} error={errors.email} />
      <Field label="Password" type="password" placeholder="••••••••" icon="lock"
        value={password} onChange={setPassword} error={errors.password}
        right={<a href="#" style={{ color: "var(--teal)", fontSize: 12, fontWeight: 600, textDecoration: "none" }}>Forgot password?</a>}
      />
      <button type="submit" className="btn-primary" disabled={loading}
        style={{ padding: "14px", borderRadius: 12, fontSize: 13, letterSpacing: "0.08em", display: "flex", alignItems: "center", justifyContent: "center", gap: 8 }}>
        {loading ? <><Spinner /> Signing in…</> : "CONTINUE"}
      </button>
      <p style={{ textAlign: "center", fontSize: 14, color: "var(--muted)" }}>
        Don't have an account?{" "}
        <button type="button" onClick={onSwitch}
          style={{ background: "none", border: "none", color: "var(--teal)", fontWeight: 700, cursor: "pointer", fontSize: 14 }}>
          Register
        </button>
      </p>
    </form>
  );
}

/* ─── Register Form ─────────────────────────────────────────────────────── */
function RegisterForm({ onSwitch }) {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [errors, setErrors] = useState({});
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState("");
  const login = useAuthStore((s) => s.login);
  const navigate = useNavigate();
  const from = useLocation().state?.from ?? "/";

  const submit = async (e) => {
    e.preventDefault(); setErr("");
    const v = {};
    if (!name.trim()) v.name = "Enter your full name.";
    if (!isValidEmail(email)) v.email = "Enter a valid email.";
    if (password.length < 8) v.password = "Minimum 8 characters.";
    if (confirm !== password) v.confirm = "Passwords do not match.";
    setErrors(v);
    if (Object.keys(v).length) return;
    setLoading(true);
    try {
      const { data } = await api.post("/auth/register", { name, email, password });
      login(data); navigate(from, { replace: true });
    } catch (ex) { setErr(ex?.response?.data?.message ?? "Registration failed."); }
    finally { setLoading(false); }
  };

  return (
    <form onSubmit={submit} noValidate style={{ display: "flex", flexDirection: "column", gap: 16, animation: "slide-tab .25s ease both" }}>
      {err && (
        <div style={{ background: "rgba(248,113,113,.1)", border: "1px solid rgba(248,113,113,.25)", borderRadius: 10, padding: "12px 16px", color: "#f87171", fontSize: 13 }}>
          {err}
        </div>
      )}
      <Field label="Full Name" placeholder="John Doe" icon="person"
        value={name} onChange={setName} error={errors.name} />
      <Field label="Email Address" type="email" placeholder="name@company.com" icon="mail"
        value={email} onChange={setEmail} error={errors.email} />
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          <label style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.1em", color: "var(--muted)" }}>Password</label>
          <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="••••••••"
            className="input-field" style={{ padding: "12px", fontSize: 14 }} />
          {errors.password && <p style={{ color: "#f87171", fontSize: 11 }}>{errors.password}</p>}
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          <label style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.1em", color: "var(--muted)" }}>Confirm</label>
          <input type="password" value={confirm} onChange={(e) => setConfirm(e.target.value)} placeholder="••••••••"
            className="input-field" style={{ padding: "12px", fontSize: 14 }} />
          {errors.confirm && <p style={{ color: "#f87171", fontSize: 11 }}>{errors.confirm}</p>}
        </div>
      </div>
      <button type="submit" className="btn-primary" disabled={loading}
        style={{ padding: "14px", borderRadius: 12, fontSize: 13, letterSpacing: "0.08em", display: "flex", alignItems: "center", justifyContent: "center", gap: 8, marginTop: 4 }}>
        {loading ? <><Spinner /> Creating account…</> : "CREATE ACCOUNT"}
      </button>
      <p style={{ textAlign: "center", fontSize: 11, color: "rgba(255,255,255,.25)", textTransform: "uppercase", letterSpacing: "0.06em", lineHeight: 1.6 }}>
        By registering, you agree to our Terms and data policies.
      </p>
      <p style={{ textAlign: "center", fontSize: 14, color: "var(--muted)" }}>
        Already have an account?{" "}
        <button type="button" onClick={onSwitch}
          style={{ background: "none", border: "none", color: "var(--teal)", fontWeight: 700, cursor: "pointer", fontSize: 14 }}>
          Sign In
        </button>
      </p>
    </form>
  );
}

/* ─── ROOT ──────────────────────────────────────────────────────────────── */
export default function AuthPage() {
  const [view, setView] = useState("login");
  const authRef = useRef(null);
  useScrollReveal();

  const scrollToAuth = () => authRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });

  return (
    <div style={{ minHeight: "100vh", background: "var(--bg)", fontFamily: "'DM Sans',sans-serif", overflowX: "hidden" }}>
      <style>{STYLES}</style>

      {/* ── Background orbs (fixed) ──────────────────────────────────────── */}
      <div style={{ position: "fixed", inset: 0, pointerEvents: "none", zIndex: 0, overflow: "hidden" }}>
        <div className="orb" style={{ width: 700, height: 700, top: "-20%", left: "-15%", background: "#0ea5e9", opacity: .25, animationDuration: "22s" }} />
        <div className="orb" style={{ width: 600, height: 600, bottom: "-15%", right: "-10%", background: "#7c3aed", opacity: .25, animationDuration: "28s", animationDelay: "-8s" }} />
        <div className="orb" style={{ width: 400, height: 400, top: "40%", left: "45%", background: "#06b6d4", opacity: .15, animationDuration: "18s", animationDelay: "-4s" }} />
        <div className="dot-grid" style={{ position: "absolute", inset: 0, opacity: .4 }} />
      </div>

      {/* ── Navbar ───────────────────────────────────────────────────────── */}
      <nav style={{
        position: "fixed", top: 0, width: "100%", zIndex: 100,
        display: "flex", alignItems: "center", justifyContent: "space-between",
        padding: "0 48px", height: 68,
        background: "rgba(8,12,20,.85)", backdropFilter: "blur(20px)",
        borderBottom: "1px solid rgba(255,255,255,.06)",
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <div style={{
            width: 34, height: 34, borderRadius: 10, display: "flex", alignItems: "center", justifyContent: "center",
            background: "linear-gradient(135deg,#00d4ff,#7c3aed)", boxShadow: "0 0 20px rgba(0,212,255,.4)",
          }}>
            <span className="material-symbols-outlined" style={{ color: "#fff", fontSize: 20, fontVariationSettings: "'FILL' 1" }}>description</span>
          </div>
          <span style={{
            fontFamily: "'Syne',sans-serif", fontWeight: 800, fontSize: 20, letterSpacing: "-.02em",
            background: "linear-gradient(to right,#00d4ff,#a78bfa)", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent"
          }}>
            CollabDocs
          </span>
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <button onClick={() => { setView("login"); scrollToAuth(); }} className="btn-outline"
            style={{ padding: "8px 20px", borderRadius: 8, fontSize: 13, fontFamily: "'DM Sans',sans-serif" }}>
            Sign In
          </button>
          <button onClick={() => { setView("register"); scrollToAuth(); }} className="btn-primary"
            style={{ padding: "8px 20px", borderRadius: 8, fontSize: 13, fontFamily: "'DM Sans',sans-serif" }}>
            Get Started
          </button>
        </div>
      </nav>

      {/* ── Hero ─────────────────────────────────────────────────────────── */}
      <section style={{ position: "relative", zIndex: 1, minHeight: "100vh", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: "120px 24px 80px", textAlign: "center" }}>

        {/* Live badge */}
        <div style={{ display: "inline-flex", alignItems: "center", gap: 8, background: "rgba(0,212,255,.08)", border: "1px solid rgba(0,212,255,.2)", borderRadius: 40, padding: "6px 16px", marginBottom: 32 }}>
          <div style={{ width: 7, height: 7, borderRadius: "50%", background: "#00d4ff", animation: "pulse-dot 1.8s infinite" }} />
          <span style={{ fontSize: 12, fontWeight: 700, color: "var(--teal)", letterSpacing: "0.08em", textTransform: "uppercase" }}>
            Real-time Collaboration — Live Now
          </span>
        </div>

        {/* Headline */}
        <h1 style={{ fontFamily: "'Syne',sans-serif", fontWeight: 800, fontSize: "clamp(32px,4vw,58px)", lineHeight: 1.15, letterSpacing: "-.01em", maxWidth: 820, marginBottom: 24 }}>
          Write Together,{" "}
          <span className="gradient-text">Think Together</span>
          {" "}— In Real Time.
        </h1>

        <p style={{ fontSize: "clamp(15px,1.5vw,20px)", color: "var(--muted)", maxWidth: 580, lineHeight: 1.75, marginBottom: 48 }}>
          CollabDocs is a Google Docs-style collaborative editor powered by
          Operational Transformation — resolving every concurrent edit conflict
          in under 50 milliseconds, across as many users as you need.
        </p>

        {/* CTAs */}
        <div style={{ display: "flex", gap: 16, flexWrap: "wrap", justifyContent: "center", marginBottom: 80 }}>
          <button onClick={() => { setView("register"); scrollToAuth(); }} className="btn-primary"
            style={{ padding: "16px 36px", borderRadius: 12, fontSize: 15, fontFamily: "'DM Sans',sans-serif", display: "flex", alignItems: "center", gap: 8 }}>
            Start Writing Free
            <span className="material-symbols-outlined" style={{ fontSize: 18 }}>arrow_forward</span>
          </button>
          <button onClick={() => { setView("login"); scrollToAuth(); }} className="btn-outline"
            style={{ padding: "16px 36px", borderRadius: 12, fontSize: 15, fontFamily: "'DM Sans',sans-serif" }}>
            Sign In
          </button>
        </div>

        {/* Hero visual — mini editor mock */}
        <div className="glass fade-in" style={{
          maxWidth: 780, width: "100%", borderRadius: 20, overflow: "hidden",
          boxShadow: "0 40px 100px rgba(0,0,0,.5), 0 0 0 1px rgba(255,255,255,.06)",
          animationDelay: ".4s",
        }}>
          {/* Fake browser chrome */}
          <div style={{ padding: "12px 20px", background: "rgba(255,255,255,.03)", borderBottom: "1px solid rgba(255,255,255,.07)", display: "flex", alignItems: "center", gap: 8 }}>
            {["#f87171", "#fb923c", "#4ade80"].map((c, i) => (
              <div key={i} style={{ width: 11, height: 11, borderRadius: "50%", background: c, opacity: .7 }} />
            ))}
            <div style={{ flex: 1, height: 24, background: "rgba(255,255,255,.04)", borderRadius: 6, marginLeft: 12, maxWidth: 300 }} />
            <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
              {["JA", "SR", "MK"].map((init, i) => (
                <div key={i} style={{
                  width: 24, height: 24, borderRadius: "50%", border: "2px solid var(--bg)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 9, fontWeight: 800, color: "#fff",
                  background: ["#00d4ff", "#7c3aed", "#f59e0b"][i], boxShadow: `0 0 0 2px ${["#00d4ff", "#7c3aed", "#f59e0b"][i]}50`
                }}>
                  {init}
                </div>
              ))}
              <span style={{ fontSize: 11, color: "var(--muted)", marginLeft: 4 }}>3 online</span>
            </div>
          </div>
          {/* Fake editor content */}
          <div style={{ padding: "36px 48px", minHeight: 200, textAlign: "left" }}>
            <div style={{ fontFamily: "'Syne',sans-serif", fontSize: 22, fontWeight: 700, color: "var(--text)", marginBottom: 20 }}>
              Q4 Product Strategy 2024
            </div>

            {/* Line 1 — full */}
            <div style={{ height: 10, background: "rgba(255,255,255,.07)", borderRadius: 4, width: "100%", marginBottom: 10 }} />

            {/* Line 2 — SR cursor sits here */}
            <div style={{ position: "relative", marginBottom: 10 }}>
              <div style={{ height: 10, background: "rgba(255,255,255,.07)", borderRadius: 4, width: "85%" }} />
              <div style={{ position: "absolute", top: -18, left: "40%", display: "inline-flex", flexDirection: "column", alignItems: "flex-start" }}>
                <div style={{ background: "#7c3aed", color: "#fff", fontSize: 9, fontWeight: 800, padding: "2px 8px", borderRadius: 4, marginBottom: 2, whiteSpace: "nowrap" }}>Sarah</div>
                <div style={{ width: 2, height: 18, background: "#7c3aed", boxShadow: "0 0 6px #7c3aed", animation: "pulse-dot 1.5s infinite" }} />
              </div>
            </div>

            {/* Lines 3-5 */}
            {[92, 70, 100].map((w, i) => (
              <div key={i} style={{ height: 10, background: "rgba(255,255,255,.07)", borderRadius: 4, width: `${w}%`, marginBottom: 10 }} />
            ))}

            {/* Line 6 — Jaideep cursor */}
            <div style={{ height: 10, background: "rgba(255,255,255,.07)", borderRadius: 4, width: "45%", marginBottom: 10 }} />

            {/* Jaideep cursor at end of last line */}
            <div style={{ display: "inline-flex", flexDirection: "column", alignItems: "flex-start", marginTop: 4 }}>
              <div style={{ background: "#00d4ff", color: "#003642", fontSize: 9, fontWeight: 800, padding: "2px 8px", borderRadius: 4, marginBottom: 2 }}>Jaideep</div>
              <div style={{ width: 2, height: 18, background: "#00d4ff", boxShadow: "0 0 6px #00d4ff", animation: "pulse-dot 1.2s infinite" }} />
            </div>
          </div>
        </div>
      </section>

      {/* ── Stats bar ────────────────────────────────────────────────────── */}
      <section className="scroll-section" style={{ position: "relative", zIndex: 1, padding: "0 24px 100px" }}>
        <div style={{ maxWidth: 800, margin: "0 auto", display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 1, borderRadius: 20, overflow: "hidden", border: "1px solid var(--border)" }}>
          {STATS.map((s, i) => (
            <div key={i} className="glass" style={{ padding: "40px 24px", textAlign: "center", borderRadius: 0 }}>
              <div style={{
                fontFamily: "'Syne',sans-serif", fontWeight: 800, fontSize: 42, lineHeight: 1, marginBottom: 12,
                background: "linear-gradient(135deg,var(--teal),#a78bfa)", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent"
              }}>
                {s.value}
              </div>
              <div style={{ fontSize: 13, color: "var(--muted)", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.08em" }}>{s.label}</div>
            </div>
          ))}
        </div>
      </section>

      {/* ── Features ─────────────────────────────────────────────────────── */}
      <section className="scroll-section" style={{ position: "relative", zIndex: 1, padding: "0 24px 120px" }}>
        <div style={{ maxWidth: 1100, margin: "0 auto" }}>
          <div style={{ textAlign: "center", marginBottom: 64 }}>
            <p style={{ fontSize: 12, fontWeight: 700, color: "var(--teal)", textTransform: "uppercase", letterSpacing: "0.12em", marginBottom: 16 }}>
              Why CollabDocs
            </p>
            <h2 style={{ fontFamily: "'Syne',sans-serif", fontWeight: 800, fontSize: "clamp(24px,2.8vw,40px)", letterSpacing: "-.01em" }}>
              Built for speed. Designed for teams.
            </h2>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(300px,1fr))", gap: 20 }}>
            {FEATURES.map((f, i) => (
              <div key={i} className="glass feature-card" style={{ padding: "32px", borderRadius: 20, cursor: "default" }}>
                <div style={{
                  width: 44, height: 44, borderRadius: 12, display: "flex", alignItems: "center", justifyContent: "center", marginBottom: 20,
                  background: "linear-gradient(135deg,rgba(0,212,255,.15),rgba(124,58,237,.15))",
                  border: "1px solid rgba(0,212,255,.2)"
                }}>
                  <span className="material-symbols-outlined" style={{ color: "var(--teal)", fontSize: 22 }}>{f.icon}</span>
                </div>
                <h3 style={{ fontFamily: "'Syne',sans-serif", fontWeight: 700, fontSize: 18, marginBottom: 10, letterSpacing: "-.01em" }}>{f.title}</h3>
                <p style={{ fontSize: 14, color: "var(--muted)", lineHeight: 1.75 }}>{f.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── How it works ─────────────────────────────────────────────────── */}
      <section className="scroll-section" style={{ position: "relative", zIndex: 1, padding: "0 24px 120px" }}>
        <div style={{ maxWidth: 900, margin: "0 auto" }}>
          <div style={{ textAlign: "center", marginBottom: 64 }}>
            <p style={{ fontSize: 12, fontWeight: 700, color: "var(--teal)", textTransform: "uppercase", letterSpacing: "0.12em", marginBottom: 16 }}>Simple by Design</p>
            <h2 style={{ fontFamily: "'Syne',sans-serif", fontWeight: 800, fontSize: "clamp(24px,2.8vw,40px)", letterSpacing: "-.01em" }}>
              Up and running in 30 seconds
            </h2>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 48, position: "relative" }}>
            {STEPS.map((s, i) => (
              <div key={i} style={{ textAlign: "center", position: "relative" }}>
                {i < STEPS.length - 1 && (
                  <div style={{
                    position: "absolute", top: 24, left: "calc(50% + 28px)", width: "calc(100% - 56px)", height: 1,
                    background: "linear-gradient(to right,rgba(0,212,255,.3),transparent)"
                  }} />
                )}
                <div style={{
                  width: 52, height: 52, borderRadius: "50%", margin: "0 auto 24px",
                  display: "flex", alignItems: "center", justifyContent: "center",
                  background: "linear-gradient(135deg,rgba(0,212,255,.2),rgba(124,58,237,.2))",
                  border: "1px solid rgba(0,212,255,.3)",
                  fontFamily: "'Syne',sans-serif", fontWeight: 800, fontSize: 16, color: "var(--teal)"
                }}>
                  {s.n}
                </div>
                <h3 style={{ fontFamily: "'Syne',sans-serif", fontWeight: 700, fontSize: 17, marginBottom: 12 }}>{s.title}</h3>
                <p style={{ fontSize: 14, color: "var(--muted)", lineHeight: 1.7 }}>{s.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Auth card ────────────────────────────────────────────────────── */}
      <section ref={authRef} className="scroll-section" style={{ position: "relative", zIndex: 1, padding: "0 24px 120px", display: "flex", flexDirection: "column", alignItems: "center" }}>
        <div style={{ textAlign: "center", marginBottom: 40 }}>
          <h2 style={{ fontFamily: "'Syne',sans-serif", fontWeight: 800, fontSize: "clamp(22px,2.5vw,36px)", letterSpacing: "-.01em", marginBottom: 12 }}>
            Ready to collaborate?
          </h2>
          <p style={{ fontSize: 15, color: "var(--muted)" }}>Create your free account — no credit card required.</p>
        </div>

        <div className="glass" style={{ width: "100%", maxWidth: 440, borderRadius: 24, padding: "40px", boxShadow: "0 40px 100px rgba(0,0,0,.4)" }}>
          {/* Logo */}
          <div style={{ display: "flex", flexDirection: "column", alignItems: "center", marginBottom: 32, gap: 12 }}>
            <div style={{
              width: 48, height: 48, borderRadius: 14, display: "flex", alignItems: "center", justifyContent: "center",
              background: "linear-gradient(135deg,rgba(0,212,255,.2),rgba(124,58,237,.2))",
              border: "1px solid rgba(0,212,255,.3)", boxShadow: "0 0 20px rgba(0,212,255,.2)"
            }}>
              <span className="material-symbols-outlined" style={{ color: "var(--teal)", fontSize: 26, fontVariationSettings: "'FILL' 1" }}>description</span>
            </div>
            <span style={{
              fontFamily: "'Syne',sans-serif", fontWeight: 800, fontSize: 24, letterSpacing: "-.02em",
              background: "linear-gradient(to right,#00d4ff,#a78bfa)", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent"
            }}>
              CollabDocs
            </span>
          </div>

          {/* Tab switcher */}
          <div style={{ display: "flex", borderBottom: "1px solid rgba(255,255,255,.08)", marginBottom: 28, gap: 24 }}>
            {[{ key: "login", label: "Sign In" }, { key: "register", label: "Register" }].map(({ key, label }) => (
              <button key={key} type="button"
                onClick={() => setView(key)}
                className={view === key ? "tab-active" : "tab-inactive"}
                style={{
                  background: "none", border: "none", fontFamily: "'DM Sans',sans-serif", fontWeight: 700, fontSize: 15,
                  paddingBottom: 12, cursor: "pointer", transition: "color .2s"
                }}>
                {label}
              </button>
            ))}
          </div>

          {view === "login"
            ? <LoginForm onSwitch={() => setView("register")} />
            : <RegisterForm onSwitch={() => setView("login")} />
          }
        </div>
      </section>

      {/* ── Footer ───────────────────────────────────────────────────────── */}
      <footer style={{
        position: "relative", zIndex: 1,
        borderTop: "1px solid var(--border)",
        padding: "40px 48px",
        display: "flex", flexDirection: "column", gap: 20,
      }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 16 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <div style={{ width: 28, height: 28, borderRadius: 8, background: "linear-gradient(135deg,#00d4ff,#7c3aed)", display: "flex", alignItems: "center", justifyContent: "center" }}>
              <span className="material-symbols-outlined" style={{ color: "#fff", fontSize: 16, fontVariationSettings: "'FILL' 1" }}>description</span>
            </div>
            <span style={{
              fontFamily: "'Syne',sans-serif", fontWeight: 800, fontSize: 16,
              background: "linear-gradient(to right,#00d4ff,#a78bfa)", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent"
            }}>
              CollabDocs
            </span>
          </div>
          <div style={{ display: "flex", gap: 32 }}>
            {["Privacy Policy", "Terms of Service", "Security"].map((l) => (
              <a key={l} href="#" style={{
                fontSize: 12, fontWeight: 600, color: "var(--muted)", textDecoration: "none", letterSpacing: "0.06em", textTransform: "uppercase",
                transition: "color .2s"
              }}
                onMouseEnter={(e) => e.target.style.color = "var(--teal)"}
                onMouseLeave={(e) => e.target.style.color = "var(--muted)"}>
                {l}
              </a>
            ))}
          </div>
        </div>
        <p style={{ fontSize: 12, color: "rgba(255,255,255,.2)", textTransform: "uppercase", letterSpacing: "0.06em" }}>
          © 2024 CollabDocs. All rights reserved.
        </p>
      </footer>
    </div>
  );
}