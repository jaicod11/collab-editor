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
import EditorPage from "./pages/EditorPage";
import { useAuthStore } from "./store/authSlice";

function ProtectedRoute({ children }) {
  const { isAuthenticated, token } = useAuthStore();
  if (!isAuthenticated && !token) {
    return (
      <Navigate
        to="/auth"
        state={{ from: window.location.pathname }}
        replace
      />
    );
  }
  return children;
}

function PublicRoute({ children }) {
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const location = useLocation();
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
          <Route path="/editor/:docId"
            element={<ProtectedRoute><EditorPage /></ProtectedRoute>}
          />

          {/* ── Fallback ────────────────────────────────────────────────── */}
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </BrowserRouter>
    </ToastProvider>
  );
}