import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import ProtectedRoute from './components/layout/ProtectedRoute';
import MainLayout     from './components/layout/MainLayout';
import { lazy, Suspense } from 'react';
import { Loader2 } from 'lucide-react';
import Login          from './pages/Login';
import RequireRole    from './components/layout/RequireRole';
import { useAuthStore } from './stores/authStore';

// Cada pantalla se carga al visitarla (bundle inicial más chico; Reportes trae gráficas pesadas)
const Dashboard  = lazy(() => import('./pages/Dashboard'));
const Inventory  = lazy(() => import('./pages/Inventory'));
const POS        = lazy(() => import('./pages/POS'));
const Reports    = lazy(() => import('./pages/Reports'));
const Expenses   = lazy(() => import('./pages/Expenses'));
const Deliveries = lazy(() => import('./pages/Deliveries'));
const Cash       = lazy(() => import('./pages/Cash'));
const Employees  = lazy(() => import('./pages/Employees'));
const EmployeeDetail = lazy(() => import('./pages/EmployeeDetail'));
const ChangePassword = lazy(() => import('./pages/ChangePassword'));

const PageLoading = () => (
  <p role="status" className="flex items-center gap-2 text-sm text-espresso/70 p-4">
    <Loader2 size={16} className="animate-spin" aria-hidden="true" /> Cargando...
  </p>
);

const queryClient = new QueryClient({
  defaultOptions: {
    queries: { retry: 1, staleTime: 1000 * 60 * 5 },
  },
});

// Wrapper reutilizable: auth check + layout
function ProtectedPage({ children }: { children: React.ReactNode }) {
  return (
    <ProtectedRoute>
      <MainLayout><Suspense fallback={<PageLoading />}>{children}</Suspense></MainLayout>
    </ProtectedRoute>
  );
}

// Cambio de contraseña: con contraseña temporal pendiente se muestra sola (sin menú ni peticiones del resto);
// si es voluntario, dentro del layout normal.
function ChangePasswordRoute() {
  const forced = useAuthStore((s) => !!s.user?.mustChangePassword);
  const page = <Suspense fallback={<PageLoading />}><ChangePassword /></Suspense>;
  return <ProtectedRoute>{forced ? page : <MainLayout>{page}</MainLayout>}</ProtectedRoute>;
}

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <Routes>
          {/* Pública */}
          <Route path="/login" element={<Login />} />

          {/* Protegidas con layout */}
          <Route path="/dashboard"  element={<ProtectedPage><Dashboard /></ProtectedPage>} />
          <Route path="/pos"        element={<ProtectedPage><POS /></ProtectedPage>} />
          <Route path="/inventory"  element={<ProtectedPage><Inventory /></ProtectedPage>} />
          <Route path="/employees"  element={<ProtectedPage><RequireRole roles={['ADMIN']} message="Solo un administrador puede gestionar a los empleados."><Employees /></RequireRole></ProtectedPage>} />
          <Route path="/employees/:id" element={<ProtectedPage><RequireRole roles={['ADMIN']} message="Solo un administrador puede gestionar a los empleados."><EmployeeDetail /></RequireRole></ProtectedPage>} />
          <Route path="/change-password" element={<ChangePasswordRoute />} />
          <Route path="/deliveries" element={<ProtectedPage><RequireRole roles={['ADMIN','CASHIER','WAITER']} message="Tu rol no puede ver las entregas."><Deliveries /></RequireRole></ProtectedPage>} />
          <Route path="/cash"       element={<ProtectedPage><RequireRole roles={['ADMIN','CASHIER']} message="Solo cajeros y administradores pueden operar la caja."><Cash /></RequireRole></ProtectedPage>} />
          <Route path="/reports"    element={<ProtectedPage><RequireRole roles={['ADMIN']}><Reports /></RequireRole></ProtectedPage>} />
          <Route path="/expenses"   element={<ProtectedPage><RequireRole roles={['ADMIN']} message="Solo un administrador puede gestionar los gastos."><Expenses /></RequireRole></ProtectedPage>} />
          

          {/* Raíz */}
          <Route path="/" element={<Navigate to="/dashboard" replace />} />
        </Routes>
      </BrowserRouter>
    </QueryClientProvider>
  );
}