import { useLocation } from 'react-router-dom';
import { Menu } from 'lucide-react';
import { useAuthStore } from '../../stores/authStore';
import ConnectionIndicator from './ConnectionIndicator';
import CashClosedNotice from '../cash/CashClosedNotice';

const pageTitles: Record<string, string> = {
  '/dashboard':  'Dashboard',
  '/pos':        'Punto de venta',
  '/inventory':  'Inventario',
  '/employees':  'Empleados',
  '/deliveries': 'Entregas',
  '/expenses':   'Gastos',
  '/reports':    'Reportes',
  '/cash':       'Caja',
};

const roleLabels: Record<string, string> = {
  ADMIN:    'Administrador',
  CASHIER:  'Cajero',
  WAITER:   'Mesero',
  DELIVERY: 'Repartidor',
};

interface Props {
  onMenuClick: () => void;
}

export default function Header({ onMenuClick }: Props) {
  const location = useLocation();
  const user     = useAuthStore(s => s.user);
  const title    = pageTitles[location.pathname] ?? 'Dashboard';

  return (
    <header className="
      h-16 bg-white border-b border-caramel/10
      flex items-center justify-between px-6 flex-shrink-0
    ">
      {/* Izquierda: hamburger (móvil) + título */}
      <div className="flex items-center gap-4">
        <button
          onClick={onMenuClick}
          aria-label="Abrir menú"
          className="lg:hidden text-espresso/70 hover:text-espresso transition-colors rounded-lg focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-caramel-dark"
        >
          <Menu size={22} />
        </button>
        <h1 className="text-xl font-bold text-espresso">{title}</h1>
      </div>

      {/* Derecha: estado de conexión + usuario */}
      <div className="flex items-center gap-3">
        {/* En el POS el aviso va en la página; en /cash la propia pantalla muestra el estado */}
        {location.pathname !== '/pos' && location.pathname !== '/cash' && <CashClosedNotice variant="pill" />}
        <ConnectionIndicator />
        <div className="text-right hidden sm:block">
          <p className="text-sm font-semibold text-espresso leading-tight">{user?.name}</p>
          <p className="text-xs text-caramel-dark">
            {user?.role ? roleLabels[user.role] : ''}
          </p>
        </div>
        <div className="w-9 h-9 bg-espresso rounded-full flex items-center justify-center flex-shrink-0">
          <span className="text-white text-sm font-bold">
            {user?.name.charAt(0).toUpperCase()}
          </span>
        </div>
      </div>
    </header>
  );
}