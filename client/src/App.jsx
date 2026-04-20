import { BrowserRouter, Routes, Route, Navigate, useLocation } from "react-router-dom";
import { ToastProvider } from "./components/UI/Toast";
import AuthPage from "./pages/AuthPage";
import LoginPage from "./pages/LoginPage";
import RegisterPage from "./pages/RegisterPage";
import DocumentDashboard from "./pages/DocumentDashboard";
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
    // Respect where user was trying to go — don't always dump them at /
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
          <Route path="/auth" element={<PublicRoute><AuthPage /></PublicRoute>} />
          <Route path="/login" element={<PublicRoute><LoginPage /></PublicRoute>} />
          <Route path="/register" element={<PublicRoute><RegisterPage /></PublicRoute>} />
          <Route path="/" element={<ProtectedRoute><DocumentDashboard /></ProtectedRoute>} />
          <Route path="/editor/:docId" element={<ProtectedRoute><EditorPage /></ProtectedRoute>} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </BrowserRouter>
    </ToastProvider>
  );
}