/**
 * pages/AuthPage.jsx — New UI (Stitch v2)
 * Dark glassmorphism: animated orbs, floating particles, dot grid,
 * teal glow accents, smooth tab switcher between Login and Register.
 */

import { useState, useCallback } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import api from "../services/api";
import { useAuthStore } from "../store/authSlice";

const isValidEmail = (v) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v.trim());

const ANIM_STYLES = `
  @keyframes pulse-slow {
    0%,100% { transform:scale(1) translate(0,0);    opacity:.35; }
    50%      { transform:scale(1.1) translate(20px,-20px); opacity:.55; }
  }
  @keyframes drift-up {
    0%   { transform:translateY(0);       opacity:0; }
    50%  { opacity:.8; }
    100% { transform:translateY(-100vh);  opacity:0; }
  }
  @keyframes slide-up {
    from { opacity:0; transform:translateY(14px); }
    to   { opacity:1; transform:translateY(0);    }
  }
  .orb       { animation: pulse-slow 8s ease-in-out infinite alternate; }
  .particle  { position:absolute; border-radius:50%; filter:blur(1px); animation:drift-up linear infinite; }
  .dot-grid  { background-image:radial-gradient(rgba(255,255,255,.05) 1px,transparent 1px); background-size:24px 24px; }
  .form-anim { animation:slide-up .25s ease both; }
  .tab-line::after {
    content:''; position:absolute; bottom:-1px; left:0; width:100%; height:2px;
    background:#00d4ff; box-shadow:0 0 8px rgba(0,212,255,.7);
  }
`;

const PARTICLES = [
  { cls:"w-1 h-1",     l:"10%", d:"15s", dl:"0s"   },
  { cls:"w-1.5 h-1.5", l:"25%", d:"20s", dl:"-3s"  },
  { cls:"w-1 h-1",     l:"45%", d:"18s", dl:"-7s"  },
  { cls:"w-2 h-2",     l:"65%", d:"22s", dl:"-12s" },
  { cls:"w-1 h-1",     l:"85%", d:"16s", dl:"-5s"  },
  { cls:"w-1.5 h-1.5", l:"15%", d:"25s", dl:"-10s" },
  { cls:"w-1 h-1",     l:"75%", d:"19s", dl:"-2s"  },
  { cls:"w-2 h-2",     l:"55%", d:"28s", dl:"-15s" },
];

function InputField({ label, type="text", placeholder, value, onChange, error, icon, right }) {
  return (
    <div className="space-y-1.5">
      <div className="flex justify-between items-end">
        <label className="block text-white/60 text-[11px] font-bold uppercase tracking-wider ml-1">{label}</label>
        {right}
      </div>
      <div className="relative group">
        {icon && (
          <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-white/40 text-xl transition-colors group-focus-within:text-[#00d4ff]">
            {icon}
          </span>
        )}
        <input
          type={type} value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder}
          className={`w-full bg-white/5 border-b-2 text-white py-3 outline-none transition-all duration-300 placeholder:text-white/25 text-sm
            ${icon ? "pl-11" : "pl-4"}
            ${error ? "border-red-500/70" : "border-white/10 focus:border-[#00d4ff]"}`}
        />
      </div>
      {error && <p className="text-red-400 text-[10px] font-medium ml-1 mt-0.5">{error}</p>}
    </div>
  );
}

function GradientBtn({ children, loading }) {
  return (
    <button type="submit" disabled={loading}
      className="w-full mt-2 py-3.5 rounded-xl text-white font-bold text-sm tracking-widest uppercase
        bg-gradient-to-r from-[#00d4ff] to-[#7c3aed]
        shadow-[0_4px_24px_rgba(0,212,255,0.35)]
        hover:scale-[1.02] active:scale-95 transition-all duration-300
        disabled:opacity-60 disabled:cursor-not-allowed flex items-center justify-center gap-2"
    >
      {loading ? (
        <><svg className="animate-spin h-4 w-4" viewBox="0 0 24 24" fill="none">
          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/>
        </svg>Processing…</>
      ) : children}
    </button>
  );
}

function LoginForm({ onSwitch }) {
  const [email, setEmail]       = useState("");
  const [password, setPassword] = useState("");
  const [errors, setErrors]     = useState({});
  const [loading, setLoading]   = useState(false);
  const [serverErr, setServerErr] = useState("");
  const login    = useAuthStore((s) => s.login);
  const navigate = useNavigate();
  const from     = useLocation().state?.from ?? "/";

  const handleSubmit = async (e) => {
    e.preventDefault(); setServerErr("");
    const errs = {};
    if (!isValidEmail(email)) errs.email = "Please enter a valid email.";
    if (!password) errs.password = "Password is required.";
    setErrors(errs);
    if (Object.keys(errs).length) return;
    setLoading(true);
    try {
      const { data } = await api.post("/auth/login", { email, password });
      login(data); navigate(from, { replace: true });
    } catch (err) { setServerErr(err?.response?.data?.message ?? "Invalid credentials."); }
    finally { setLoading(false); }
  };

  return (
    <form className="space-y-5 form-anim" onSubmit={handleSubmit} noValidate>
      {serverErr && <div className="rounded-xl bg-red-500/10 border border-red-500/20 px-4 py-3 text-red-400 text-sm">{serverErr}</div>}
      <InputField label="Email Address" type="email" placeholder="name@company.com" icon="mail" value={email} onChange={setEmail} error={errors.email} />
      <InputField label="Password" type="password" placeholder="••••••••" icon="lock" value={password} onChange={setPassword} error={errors.password}
        right={<a href="#" className="text-[#00d4ff] text-[11px] hover:underline">Forgot password?</a>}
      />
      <GradientBtn loading={loading}>Continue</GradientBtn>
      <div className="relative flex items-center py-1">
        <div className="flex-grow border-t border-white/5" />
        <span className="mx-4 text-white/30 text-[10px] uppercase font-bold tracking-widest">or</span>
        <div className="flex-grow border-t border-white/5" />
      </div>
      <button type="button" className="w-full flex items-center justify-center gap-3 py-3 rounded-xl border border-white/10 bg-white/5 hover:bg-white/10 transition-all duration-300">
        <svg className="w-5 h-5" viewBox="0 0 24 24">
          <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
          <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
          <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/>
          <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
        </svg>
        <span className="text-white/80 font-semibold text-sm">Continue with Google</span>
      </button>
      <p className="text-center text-sm text-white/40 pt-1">
        Don't have an account?{" "}
        <button type="button" onClick={onSwitch} className="text-[#00d4ff] font-bold hover:underline">Register</button>
      </p>
    </form>
  );
}

function RegisterForm({ onSwitch }) {
  const [name, setName]         = useState("");
  const [email, setEmail]       = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm]   = useState("");
  const [errors, setErrors]     = useState({});
  const [loading, setLoading]   = useState(false);
  const [serverErr, setServerErr] = useState("");
  const login    = useAuthStore((s) => s.login);
  const navigate = useNavigate();
  const from     = useLocation().state?.from ?? "/";

  const handleSubmit = async (e) => {
    e.preventDefault(); setServerErr("");
    const errs = {};
    if (!name.trim())         errs.name     = "Please enter your name.";
    if (!isValidEmail(email)) errs.email    = "Please enter a valid email.";
    if (password.length < 8)  errs.password = "Minimum 8 characters.";
    if (confirm !== password)  errs.confirm  = "Passwords do not match.";
    setErrors(errs);
    if (Object.keys(errs).length) return;
    setLoading(true);
    try {
      const { data } = await api.post("/auth/register", { name, email, password });
      login(data); navigate(from, { replace: true });
    } catch (err) { setServerErr(err?.response?.data?.message ?? "Registration failed."); }
    finally { setLoading(false); }
  };

  return (
    <form className="space-y-4 form-anim" onSubmit={handleSubmit} noValidate>
      {serverErr && <div className="rounded-xl bg-red-500/10 border border-red-500/20 px-4 py-3 text-red-400 text-sm">{serverErr}</div>}
      <InputField label="Full Name" placeholder="John Doe" icon="person" value={name} onChange={setName} error={errors.name} />
      <InputField label="Email Address" type="email" placeholder="name@company.com" icon="mail" value={email} onChange={setEmail} error={errors.email} />
      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-1.5">
          <label className="block text-white/60 text-[11px] font-bold uppercase tracking-wider ml-1">Password</label>
          <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="••••••••"
            className={`w-full bg-white/5 border-b-2 text-white px-4 py-3 outline-none transition-all placeholder:text-white/25 text-sm ${errors.password ? "border-red-500/70" : "border-white/10 focus:border-[#00d4ff]"}`} />
          {errors.password && <p className="text-red-400 text-[10px] ml-1">{errors.password}</p>}
        </div>
        <div className="space-y-1.5">
          <label className="block text-white/60 text-[11px] font-bold uppercase tracking-wider ml-1">Confirm</label>
          <input type="password" value={confirm} onChange={(e) => setConfirm(e.target.value)} placeholder="••••••••"
            className={`w-full bg-white/5 border-b-2 text-white px-4 py-3 outline-none transition-all placeholder:text-white/25 text-sm ${errors.confirm ? "border-red-500/70" : "border-white/10 focus:border-[#00d4ff]"}`} />
          {errors.confirm && <p className="text-red-400 text-[10px] ml-1">{errors.confirm}</p>}
        </div>
      </div>
      <GradientBtn loading={loading}>Create Account</GradientBtn>
      <p className="text-center text-[10px] text-white/30 uppercase tracking-widest leading-relaxed">
        By registering, you agree to our Terms and data policies.
      </p>
      <p className="text-center text-sm text-white/40">
        Already have an account?{" "}
        <button type="button" onClick={onSwitch} className="text-[#00d4ff] font-bold hover:underline">Sign In</button>
      </p>
    </form>
  );
}

export default function AuthPage() {
  const [view, setView] = useState("login");
  return (
    <div className="min-h-screen relative flex flex-col items-center justify-center overflow-hidden" style={{ background:"#0a0f1e", fontFamily:"Manrope,sans-serif" }}>
      <style>{ANIM_STYLES}</style>

      {/* Orbs */}
      <div className="fixed inset-0 pointer-events-none z-0">
        <div className="orb absolute top-[-10%] left-[-10%] w-[50vw] h-[50vw] rounded-full" style={{ background:"#00d4ff", filter:"blur(120px)", opacity:.4 }} />
        <div className="orb absolute bottom-[-10%] right-[-10%] w-[45vw] h-[45vw] rounded-full" style={{ background:"#7c3aed", filter:"blur(120px)", opacity:.35, animationDelay:"-2s" }} />
        <div className="orb absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[40vw] h-[40vw] rounded-full" style={{ background:"#4f46e5", filter:"blur(120px)", opacity:.28, animationDelay:"-4s" }} />
      </div>

      {/* Dot grid */}
      <div className="fixed inset-0 dot-grid opacity-30 z-0 pointer-events-none" />

      {/* Particles */}
      <div className="fixed inset-0 pointer-events-none z-0">
        {PARTICLES.map((p, i) => (
          <div key={i} className={`particle ${p.cls} bg-white`} style={{ left:p.l, bottom:"-5%", animationDuration:p.d, animationDelay:p.dl }} />
        ))}
      </div>

      {/* Navbar */}
      <header className="fixed top-0 w-full border-b border-white/10 z-50 flex justify-between items-center px-10 h-20"
        style={{ background:"rgba(255,255,255,0.05)", backdropFilter:"blur(20px)" }}>
        <div className="text-xl font-black tracking-tighter text-white" style={{ textShadow:"0 0 8px rgba(0,212,255,0.4)" }}>CollabDocs</div>
        <a href="#" className="hidden md:block text-sm uppercase tracking-widest text-white/50 hover:text-white transition-colors">Support</a>
      </header>

      {/* Card */}
      <main className="relative z-10 w-full max-w-[420px] px-6 mt-16">
        <div className="rounded-2xl p-10 shadow-[0_0_50px_rgba(0,0,0,0.4)]"
          style={{ background:"rgba(255,255,255,0.05)", backdropFilter:"blur(20px)", border:"1px solid rgba(255,255,255,0.1)" }}>

          {/* Logo */}
          <div className="flex flex-col items-center mb-8">
            <div className="w-12 h-12 rounded-xl flex items-center justify-center mb-4"
              style={{ background:"rgba(0,212,255,0.2)", border:"1px solid rgba(0,212,255,0.3)", boxShadow:"0 0 15px rgba(0,212,255,0.25)" }}>
              <span className="material-symbols-outlined text-[#00d4ff] text-3xl" style={{ fontVariationSettings:"'FILL' 1" }}>description</span>
            </div>
            <h1 className="text-white text-[28px] font-black tracking-tight">CollabDocs</h1>
          </div>

          {/* Tabs */}
          <div className="flex border-b border-white/5 mb-8 relative">
            {["login","register"].map((t) => (
              <button key={t} onClick={() => setView(t)}
                className={`flex-1 py-3 font-semibold text-center relative transition-all duration-300 capitalize
                  ${view === t ? "text-white tab-line" : "text-white/40 hover:text-white/60"}`}>
                {t === "login" ? "Sign In" : "Register"}
              </button>
            ))}
          </div>

          {view === "login"
            ? <LoginForm onSwitch={() => setView("register")} />
            : <RegisterForm onSwitch={() => setView("login")} />
          }
        </div>
      </main>

      {/* Footer */}
      <footer className="fixed bottom-0 w-full py-8 z-10">
        <div className="max-w-7xl mx-auto flex flex-col md:flex-row justify-between items-center px-10 gap-4">
          <p className="text-white/30 text-xs tracking-widest uppercase">© 2024 CollabDocs. All rights reserved.</p>
          <div className="flex gap-6 text-xs tracking-widest uppercase text-white/30">
            {["Privacy Policy","Terms of Service","Security"].map((l) => (
              <a key={l} href="#" className="hover:text-[#00d4ff] transition-colors">{l}</a>
            ))}
          </div>
        </div>
      </footer>
    </div>
  );
}
