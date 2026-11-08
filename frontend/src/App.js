import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import { Toaster } from "sonner";
import { AuthProvider, useAuth } from "@/lib/auth";
import Layout from "@/components/Layout";
import Login from "@/pages/Login";
import Caixa from "@/pages/Caixa";
import Comandas from "@/pages/Comandas";
import Cardapio from "@/pages/Cardapio";
import Fiado from "@/pages/Fiado";
import Encomendas from "@/pages/Encomendas";
import Estoque from "@/pages/Estoque";
import Insumos from "@/pages/Insumos";
import Producao from "@/pages/Producao";
import Dashboard from "@/pages/Dashboard";
import Usuarios from "@/pages/Usuarios";

function Protected({ children, roles }) {
  const { user, loading } = useAuth();
  if (loading) {
    return (
      <div className="h-screen w-screen flex items-center justify-center text-amber-700 font-display text-xl">
        Carregando…
      </div>
    );
  }
  if (!user) return <Navigate to="/login" replace />;
  if (roles && !roles.includes(user.role)) return <Navigate to="/" replace />;
  return children;
}

function Home() {
  const { user } = useAuth();
  if (user?.role === "gerente") return <Navigate to="/dashboard" replace />;
  return <Navigate to="/caixa" replace />;
}

function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Toaster position="bottom-right" richColors />
        <Routes>
          <Route path="/login" element={<Login />} />
          <Route element={<Protected><Layout /></Protected>}>
            <Route path="/" element={<Home />} />
            <Route path="/caixa" element={<Caixa />} />
            <Route path="/comandas" element={<Comandas />} />
            <Route path="/fiado" element={<Fiado />} />
            <Route path="/encomendas" element={<Encomendas />} />
            <Route path="/estoque" element={<Protected roles={["gerente"]}><Estoque /></Protected>} />
            <Route path="/insumos" element={<Protected roles={["gerente"]}><Insumos /></Protected>} />
            <Route path="/producao" element={<Protected roles={["gerente"]}><Producao /></Protected>} />
            <Route path="/cardapio" element={<Protected roles={["gerente"]}><Cardapio /></Protected>} />
            <Route path="/dashboard" element={<Protected roles={["gerente"]}><Dashboard /></Protected>} />
            <Route path="/usuarios" element={<Protected roles={["gerente"]}><Usuarios /></Protected>} />
          </Route>
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  );
}

export default App;
