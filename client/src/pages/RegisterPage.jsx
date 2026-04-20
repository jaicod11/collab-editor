/**
 * pages/RegisterPage.jsx
 * ─────────────────────────────────────────────────────────────────────────────
 * Standalone register page for the /register route.
 * Mirrors LoginPage structure — wraps RegisterForm with the full auth card.
 *
 * Route: <Route path="/register" element={<RegisterPage />} />
 */

import { useEffect } from "react";
import { useNavigate, Link } from "react-router-dom";
import { RegisterForm }  from "../components/Auth/RegisterForm";
import { useAuthStore }  from "../store/authSlice";

export default function RegisterPage() {
  const navigate        = useNavigate();
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);

  useEffect(() => {
    if (isAuthenticated) navigate("/", { replace: true });
  }, [isAuthenticated, navigate]);

  return (
    <div className="bg-background text-on-background min-h-screen flex flex-col items-center justify-center p-6 relative overflow-hidden">

      {/* Blobs */}
      <div className="absolute inset-0 pointer-events-none z-0">
        <div className="absolute top-[-10%] left-[-10%] w-[40%] h-[40%] bg-surface-container-high rounded-full blur-[120px] opacity-50" />
        <div className="absolute bottom-[-10%] right-[-10%] w-[40%] h-[40%] bg-secondary-container rounded-full blur-[120px] opacity-30" />
      </div>

      {/* Brand */}
      <header className="z-10 mb-8 flex flex-col items-center">
        <Link to="/" className="flex items-center gap-3 group">
          <div className="w-10 h-10 bg-gradient-to-br from-primary to-primary-container rounded-xl flex items-center justify-center shadow-lg group-hover:shadow-xl transition-shadow">
            <span
              className="material-symbols-outlined text-white"
              style={{ fontVariationSettings: "'FILL' 1" }}
            >
              description
            </span>
          </div>
          <span className="text-2xl font-headline font-extrabold tracking-tight text-on-surface">
            CollabDocs
          </span>
        </Link>
      </header>

      {/* Card */}
      <main className="z-10 w-full max-w-[400px] bg-surface-container-lowest rounded-xl shadow-[0_24px_48px_rgba(19,27,46,0.06)] overflow-hidden">
        <RegisterForm
          onSuccess={() => navigate("/", { replace: true })}
          onSwitchToLogin={() => navigate("/login")}
        />
      </main>

      <footer className="mt-12 flex flex-col md:flex-row gap-6 text-xs text-on-surface-variant opacity-60 hover:opacity-100 transition-opacity z-10">
        <a className="hover:text-primary transition-colors" href="#">Privacy Policy</a>
        <a className="hover:text-primary transition-colors" href="#">Terms of Service</a>
      </footer>
    </div>
  );
}
