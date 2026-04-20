import { useState } from "react";
import { LoginForm } from "../components/Auth/LoginForm";
import { RegisterForm } from "../components/Auth/RegisterForm";

export default function AuthPage() {
  const [view, setView] = useState("login");

  // NO useEffect here — PublicRoute in App.jsx handles
  // the redirect when isAuthenticated becomes true.
  // The useEffect was firing navigate("/") and overriding
  // LoginForm's correct navigate(from) call.

  return (
    <div className="bg-background text-on-background min-h-screen flex flex-col items-center justify-center p-6 relative overflow-hidden">

      {/* Decorative blobs */}
      <div className="absolute inset-0 pointer-events-none z-0">
        <div className="absolute top-[-10%] left-[-10%] w-[40%] h-[40%] bg-surface-container-high rounded-full blur-[120px] opacity-50" />
        <div className="absolute bottom-[-10%] right-[-10%] w-[40%] h-[40%] bg-secondary-container rounded-full blur-[120px] opacity-30" />
      </div>

      {/* Brand */}
      <header className="z-10 mb-8 flex flex-col items-center">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-gradient-to-br from-primary to-primary-container rounded-xl flex items-center justify-center shadow-lg">
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
        </div>
      </header>

      {/* Auth card */}
      <main className="z-10 w-full max-w-[400px] bg-surface-container-lowest rounded-xl shadow-[0_24px_48px_rgba(19,27,46,0.06)] overflow-hidden transition-all duration-300">
        {view === "login" ? (
          <LoginForm onSwitchToRegister={() => setView("register")} />
        ) : (
          <RegisterForm onSwitchToLogin={() => setView("login")} />
        )}
      </main>

      {/* Footer */}
      <footer className="mt-12 flex flex-col md:flex-row gap-6 text-xs text-on-surface-variant opacity-60 hover:opacity-100 transition-opacity z-10">
        <a className="hover:text-primary transition-colors" href="#">Privacy Policy</a>
        <a className="hover:text-primary transition-colors" href="#">Terms of Service</a>
        <a className="hover:text-primary transition-colors" href="#">Help Center</a>
      </footer>
    </div>
  );
}