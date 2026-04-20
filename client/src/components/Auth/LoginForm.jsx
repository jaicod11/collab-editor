/**
 * components/Auth/LoginForm.jsx
 * ─────────────────────────────────────────────────────────────────────────────
 * Standalone login form component.
 * Used inside AuthPage.jsx — extracted here so it can also be imported
 * independently (e.g. in a modal or a separate route).
 *
 * Props:
 *   onSuccess   {fn}   — called with { token, user } after successful login
 *   onSwitchToRegister {fn} — toggles to register view
 */

import { useNavigate, useLocation } from "react-router-dom";
import { useState, useCallback } from "react";
import api from "../../services/api";
import { useAuthStore } from "../../store/authSlice";

const isValidEmail = (v) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v.trim());

function Field({ label, type = "text", placeholder, value, onChange, error, right }) {
  return (
    <div className="space-y-1.5">
      <div className="flex justify-between items-center px-1">
        <label className="text-xs font-label font-semibold text-on-surface-variant uppercase tracking-wider">
          {label}
        </label>
        {right}
      </div>
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className={`
          w-full px-4 py-3 bg-surface-container-low border rounded-xl
          focus:ring-1 focus:ring-primary/20 focus:bg-surface-container-lowest
          transition-all placeholder:text-outline/50 text-on-surface text-sm outline-none
          ${error ? "border-error/60 bg-error/5" : "border-transparent"}
        `}
      />
      {error && <p className="text-error text-[10px] font-medium px-1 animate-fade-in">{error}</p>}
    </div>
  );
}

export function LoginForm({ onSuccess, onSwitchToRegister }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [errors, setErrors] = useState({});
  const [loading, setLoading] = useState(false);
  const [serverErr, setServerErr] = useState("");

  const login = useAuthStore((s) => s.login);
  const navigate = useNavigate();
  const location = useLocation();

  // Where they were trying to go before being redirected to login
  const from = location.state?.from ?? "/";

  const validate = useCallback(() => {
    const e = {};
    if (!isValidEmail(email)) e.email = "Please enter a valid email address.";
    if (!password) e.password = "Password is required.";
    return e;
  }, [email, password]);

  const handleSubmit = async (evt) => {
    evt.preventDefault();
    setServerErr("");
    const e = validate();
    setErrors(e);
    if (Object.keys(e).length) return;

    setLoading(true);
    try {
      const { data } = await api.post("/auth/login", { email, password });
      login(data);
      // Go back to where they were trying to go (e.g. /editor/abc123)
      navigate(from, { replace: true });
    } catch (err) {
      setServerErr(err?.response?.data?.message ?? "Invalid credentials.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="p-8 md:p-10">
      <div className="mb-8">
        <h2 className="text-2xl font-headline font-bold text-on-surface mb-2">Welcome Back</h2>
        <p className="text-sm text-on-surface-variant">Sign in to continue your collaboration.</p>
      </div>

      <form className="space-y-5" onSubmit={handleSubmit} noValidate>
        {serverErr && (
          <div className="rounded-xl bg-error/10 border border-error/20 px-4 py-3 text-error text-sm font-medium">
            {serverErr}
          </div>
        )}
        <Field label="Email Address" type="email" placeholder="name@company.com"
          value={email} onChange={setEmail} error={errors.email} />
        <Field label="Password" type="password" placeholder="••••••••"
          value={password} onChange={setPassword} error={errors.password}
          right={<a href="#" className="text-[11px] font-medium text-primary hover:underline">Forgot?</a>}
        />
        <button
          type="submit" disabled={loading}
          className="w-full py-3.5 bg-gradient-to-r from-primary to-primary-container text-on-primary font-headline font-bold rounded-xl shadow-md hover:shadow-lg transition-all active:scale-[0.98] disabled:opacity-60 flex items-center justify-center gap-2"
        >
          {loading ? <><svg className="animate-spin h-4 w-4" viewBox="0 0 24 24" fill="none"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" /><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" /></svg>Signing in…</> : "Sign In"}
        </button>
      </form>

      <div className="mt-8 text-center">
        <p className="text-sm text-on-surface-variant">
          Don't have an account?{" "}
          <button type="button" onClick={onSwitchToRegister} className="text-primary font-bold hover:underline">
            Register
          </button>
        </p>
      </div>
    </div>
  );
}
