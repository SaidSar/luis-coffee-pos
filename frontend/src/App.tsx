import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import ProtectedRoute from './components/layout/ProtectedRoute';
import MainLayout     from './components/layout/MainLayout';
import Login          from './pages/Login';
import Dashboard      from './pages/Dashboard';
import Inventory from './pages/Inventory';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: { retry: 1, staleTime: 1000 * 60 * 5 },
  },
});

// Wrapper reutilizable: auth check + layout
function ProtectedPage({ children }: { children: React.ReactNode }) {
  return (
    <ProtectedRoute>
      <MainLayout>{children}</MainLayout>
    </ProtectedRoute>
  );
}

// Placeholder para páginas aún no construidas
const Soon = ({ name }: { name: string }) => (
  <div className="bg-white rounded-2xl border border-caramel/10 p-10 text-center">
    <p className="text-2xl font-bold text-espresso">{name}</p>
    <p className="text-caramel mt-2 text-sm">Módulo en construcción 🔨</p>
  </div>
);

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <Routes>
          {/* Pública */}
          <Route path="/login" element={<Login />} />

          {/* Protegidas con layout */}
          <Route path="/dashboard"  element={<ProtectedPage><Dashboard /></ProtectedPage>} />
          <Route path="/pos"        element={<ProtectedPage><Soon name="Punto de Venta"  /></ProtectedPage>} />
          <Route path="/inventory"  element={<ProtectedPage><Inventory /></ProtectedPage>} />
          <Route path="/employees"  element={<ProtectedPage><Soon name="Empleados"       /></ProtectedPage>} />
          <Route path="/deliveries" element={<ProtectedPage><Soon name="Entregas"        /></ProtectedPage>} />
          <Route path="/reports"    element={<ProtectedPage><Soon name="Reportes"        /></ProtectedPage>} />
          

          {/* Raíz */}
          <Route path="/" element={<Navigate to="/dashboard" replace />} />
        </Routes>
      </BrowserRouter>
    </QueryClientProvider>
  );
}