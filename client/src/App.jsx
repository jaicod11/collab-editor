/**
 * App.jsx — final wired version
 * All routes, guards, and ToastProvider.
 */

import { BrowserRouter, Routes, Route, Navigate, useLocation } from "react-router-dom";
import { ToastProvider } from "./components/UI/Toast";
import AuthPage from "./pages/AuthPage";
import DocumentDashboard from "./pages/DocumentDashboard";
import MyDocumentsPage from "./pages/MyDocumentsPage";
import SharedWithMePage from "./pages/SharedWithMePage";
import StarredPage from "./pages/StarredPage";
import TrashPage from "./pages/TrashPage";
import ArchivePage from "./pages/ArchivePage";
import NewDocumentPage from "./pages/NewDocumentPage";
import SettingsPage from "./pages/SettingsPage";
import EditorPage from "./pages/EditorPage";
import JoinPage from "./pages/JoinPage";
import { useAuthStore, hasHydrated } from "./store/authSlice";

function ProtectedRoute({ children }) {
  const token = useAuthStore((s) => s.token);
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);

  // persist uses synchronous storage, so this is normally already true on the
  // first render. Guarding anyway: reading the store before rehydration has
  // finished would redirect a signed-in user to /auth on every reload, which is
  // the failure this phase existed to fix — it must not come back through a
  // storage change.
  if (!hasHydrated()) return null;

  if (!isAuthenticated && !token) {
    return (
      <Navigate
        to="/auth"
        state={{ from: window.location.pathname + window.location.search }}
        replace
      />
    );
  }
  return children;
}

function PublicRoute({ children }) {
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const location = useLocation();
  if (!hasHydrated()) return null;
  if (isAuthenticated) {
    const from = location.state?.from ?? "/";
    return <Navigate to={from} replace />;
  }
  return children;
}

export default function App() {
  return (
    <ToastProvider>
      <BrowserRouter>
        <Routes>
          {/* ── Public ──────────────────────────────────────────────────── */}
          <Route path="/auth" element={<PublicRoute><AuthPage /></PublicRoute>} />

          {/* ── Protected ───────────────────────────────────────────────── */}
          <Route path="/"
            element={<ProtectedRoute><DocumentDashboard /></ProtectedRoute>}
          />
          <Route path="/documents"
            element={<ProtectedRoute><MyDocumentsPage /></ProtectedRoute>}
          />
          <Route path="/shared"
            element={<ProtectedRoute><SharedWithMePage /></ProtectedRoute>}
          />
          <Route path="/starred"
            element={<ProtectedRoute><StarredPage /></ProtectedRoute>}
          />
          <Route path="/new"
            element={<ProtectedRoute><NewDocumentPage /></ProtectedRoute>}
          />
          <Route path="/trash"
            element={<ProtectedRoute><TrashPage /></ProtectedRoute>}
          />
          <Route path="/archive"
            element={<ProtectedRoute><ArchivePage /></ProtectedRoute>}
          />
          <Route path="/settings"
            element={<ProtectedRoute><SettingsPage /></ProtectedRoute>}
          />
          <Route path="/editor/:docId"
            element={<ProtectedRoute><EditorPage /></ProtectedRoute>}
          />

          {/* Share links. Protected: an anonymous visitor is bounced to /auth
              with this path in location state, and PublicRoute returns them
              here once they sign in. */}
          <Route path="/join/:token"
            element={<ProtectedRoute><JoinPage /></ProtectedRoute>}
          />

          {/* ── Fallback ────────────────────────────────────────────────── */}
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </BrowserRouter>
    </ToastProvider>
  );
}