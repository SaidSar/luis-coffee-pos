import { Navigate, useLocation } from 'react-router-dom';
import { useAuthStore } from '../../stores/authStore';

interface Props {
  children: React.ReactNode;
}

export default function ProtectedRoute({ children }: Props) {
  const isAuthenticated = useAuthStore(s => s.isAuthenticated());
  const mustChange      = useAuthStore(s => !!s.user?.mustChangePassword);
  const { pathname }    = useLocation();
  if (!isAuthenticated) return <Navigate to="/login" replace />;
  // Con contraseña temporal no se puede navegar a otra ruta hasta cambiarla
  if (mustChange && pathname !== '/change-password') return <Navigate to="/change-password" replace />;
  return <>{children}</>;
}