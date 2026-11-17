import type { ReactNode } from 'react';
import { Lock } from 'lucide-react';
import { useAuthStore } from '../../stores/authStore';
import type { Role } from '../../types';

interface Props {
  roles:    Role[];
  children: ReactNode;
  message?: string; // explicación bajo "No tienes acceso a esta sección"
}

// Protege una página por rol. El backend sigue siendo la autoridad (responde 403);
// aquí se muestra un aviso claro en lugar de una pantalla con errores.
export default function RequireRole({ roles, children, message = 'Solo un administrador puede ver los reportes.' }: Props) {
  const role = useAuthStore((s) => s.user?.role);
  if (role && roles.includes(role)) return <>{children}</>;
  return (
    <div role="alert" className="bg-white rounded-2xl border border-caramel/10 p-10 text-center flex flex-col items-center gap-2">
      <Lock size={28} className="text-espresso/70" aria-hidden="true" />
      <p className="font-semibold text-espresso">No tienes acceso a esta sección</p>
      <p className="text-sm text-espresso/70">{message}</p>
    </div>
  );
}
