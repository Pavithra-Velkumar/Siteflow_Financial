import "@/App.css";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { Toaster } from "sonner";
import { AuthProvider, useAuth } from "@/context/AuthContext";
import Login from "@/pages/Login";
import Register from "@/pages/Register";
import Layout from "@/components/Layout";
import Dashboard from "@/pages/Dashboard";
import CashFlow from "@/pages/CashFlow";
import Employees from "@/pages/Employees";
import Planner from "@/pages/Planner";
import Documents from "@/pages/Documents";
import Projects from "@/pages/Projects";

const Protected = ({ children }) => {
  const { user, loading } = useAuth();
  if (loading) return <div className="h-screen w-screen flex items-center justify-center bg-[#1e293b] text-white">Loading...</div>;
  if (!user) return <Navigate to="/login" replace />;
  return children;
};

const PublicOnly = ({ children }) => {
  const { user, loading } = useAuth();
  if (loading) return <div className="h-screen w-screen flex items-center justify-center bg-[#1e293b] text-white">Loading...</div>;
  if (user) return <Navigate to="/" replace />;
  return children;
};

function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Toaster position="top-right" richColors closeButton />
        <Routes>
          <Route path="/login" element={<PublicOnly><Login /></PublicOnly>} />
          <Route path="/register" element={<PublicOnly><Register /></PublicOnly>} />
          <Route element={<Protected><Layout /></Protected>}>
            <Route path="/" element={<Dashboard />} />
            <Route path="/cashflow" element={<CashFlow />} />
            <Route path="/employees" element={<Employees />} />
            <Route path="/planner" element={<Planner />} />
            <Route path="/projects" element={<Projects />} />
            <Route path="/documents" element={<Documents />} />
          </Route>
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  );
}

export default App;
