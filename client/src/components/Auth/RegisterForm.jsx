/**
 * components/Auth/RegisterForm.jsx
 * ─────────────────────────────────────────────────────────────────────────────
 * Standalone register form.
 * After successful register, redirects back to the page the user
 * was trying to visit before being sent to login (e.g. /editor/abc123).
 */

import { useState, useCallback } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import api from "../../services/api";
import { useAuthStore } from "../../store/authSlice";

const isValidEmail = (v) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v.trim());

// ─── Reusable field ───────────────────────────────────────────────────────────
function Field({ label, type = "text", placeholder, value, onChange, error }) {
  return (
    <div className="space-y-1.5">
      <label className="text-xs font-label font-semibold text-on-surface-variant uppercase tracking-wider px-1">
        {label}
      </label>
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
      {error && (
        <p className="text-error text-[10px] font-medium px-1 mt-1">
          {error}
        </p>
      )}
    </div>
  );
}

// ─── RegisterForm ─────────────────────────────────────────────────────────────
export function RegisterForm({ onSwitchToLogin }) {
  const [name,      setName]      = useState("");
  const [email,     setEmail]     = useState("");
  const [password,  setPassword]  = useState("");
  const [confirm,   setConfirm]   = useState("");
  const [errors,    setErrors]    = useState({});
  const [loading,   setLoading]   = useState(false);
  const [serverErr, setServerErr] = useState("");

  const login    = useAuthStore((s) => s.login);
  const navigate = useNavigate();
  const location = useLocation();

  // Where the user was trying to go before being redirected to auth
  // e.g. /editor/abc123 — fall back to dashboard if not set
  const from = location.state?.from ?? "/";

  // ── Validation ──────────────────────────────────────────────────────────
  const validate = useCallback(() => {
    const e = {};
    if (!name.trim())         e.name     = "Please enter your full name.";
    if (!isValidEmail(email)) e.email    = "Please enter a valid email.";
    if (password.length < 8)  e.password = "Password must be at least 8 characters.";
    if (confirm !== password)  e.confirm  = "Passwords do not match.";
    return e;
  }, [name, email, password, confirm]);

  // ── Submit ──────────────────────────────────────────────────────────────
  const handleSubmit = async (evt) => {
    evt.preventDefault();
    setServerErr("");

    const e = validate();
    setErrors(e);
    if (Object.keys(e).length) return;

    setLoading(true);
    try {
      const { data } = await api.post("/auth/register", { name, email, password });
      login(data); // store token + user in Zustand + localStorage

      // Redirect to where they were trying to go (e.g. the shared editor link)
      navigate(from, { replace: true });
    } catch (err) {
      setServerErr(
        err?.response?.data?.message ?? "Registration failed. Please try again."
      );
    } finally {
      setLoading(false);
    }
  };

  // ── Render ──────────────────────────────────────────────────────────────
  return (
    <div className="p-8 md:p-10">
      {/* Header */}
      <div className="mb-8">
        <h2 className="text-2xl font-headline font-bold text-on-surface mb-2">
          Create Account
        </h2>
        <p className="text-sm text-on-surface-variant">
          Join CollabDocs to start building together.
        </p>
      </div>

      <form className="space-y-4" onSubmit={handleSubmit} noValidate>

        {/* Server error banner */}
        {serverErr && (
          <div className="rounded-xl bg-error/10 border border-error/20 px-4 py-3 text-error text-sm font-medium">
            {serverErr}
          </div>
        )}

        <Field
          label="Full Name"
          placeholder="John Doe"
          value={name}
          onChange={setName}
          error={errors.name}
        />
        <Field
          label="Email Address"
          type="email"
          placeholder="name@company.com"
          value={email}
          onChange={setEmail}
          error={errors.email}
        />
        <Field
          label="Password"
          type="password"
          placeholder="••••••••"
          value={password}
          onChange={setPassword}
          error={errors.password}
        />
        <Field
          label="Confirm Password"
          type="password"
          placeholder="••••••••"
          value={confirm}
          onChange={setConfirm}
          error={errors.confirm}
        />

        {/* Submit button */}
        <button
          type="submit"
          disabled={loading}
          className="
            w-full py-3.5 mt-2
            bg-gradient-to-r from-primary to-primary-container
            text-on-primary font-headline font-bold rounded-xl
            shadow-md hover:shadow-lg transition-all active:scale-[0.98]
            disabled:opacity-60 disabled:cursor-not-allowed
            flex items-center justify-center gap-2
          "
        >
          {loading ? (
            <>
              <svg
                className="animate-spin h-4 w-4"
                viewBox="0 0 24 24"
                fill="none"
              >
                <circle
                  className="opacity-25"
                  cx="12" cy="12" r="10"
                  stroke="currentColor"
                  strokeWidth="4"
                />
                <path
                  className="opacity-75"
                  fill="currentColor"
                  d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
                />
              </svg>
              Creating account…
            </>
          ) : (
            "Create Account"
          )}
        </button>
      </form>

      {/* Switch to login */}
      <div className="mt-8 text-center">
        <p className="text-sm text-on-surface-variant">
          Already have an account?{" "}
          <button
            type="button"
            onClick={onSwitchToLogin}
            className="text-primary font-bold hover:underline"
          >
            Sign In
          </button>
        </p>
      </div>
    </div>
  );
}
