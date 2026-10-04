import { NavLink } from 'react-router-dom';
import {
  LayoutDashboard, ShoppingCart, Package,
  Users, Truck, FileSpreadsheet,
  Coffee, LogOut, X,
} from 'lucide-react';
import { useAuthStore } from '../../stores/authStore';
import { useLogout } from '../../hooks/useAuth';
import type { Role } from '../../types';

interface NavItem {
  label: string;
  path:  string;
  icon:  React.ElementType;
  roles?: Role[];
}

const navItems: NavItem[] = [
  { label: 'Dashboard',      path: '/dashboard',  icon: LayoutDashboard                          },
  { label: 'Punto de venta', path: '/pos',        icon: ShoppingCart                             },
  { label: 'Inventario',     path: '/inventory',  icon: Package                                  },
  { label: 'Empleados',      path: '/employees',  icon: Users,            roles: ['ADMIN']        },
  { label: 'Entregas',       path: '/deliveries', icon: Truck                                    },
  { label: 'Reportes',       path: '/reports',    icon: FileSpreadsheet,  roles: ['ADMIN','CASHIER'] },
];

interface Props {
  isOpen:  boolean;
  onClose: () => void;
}

export default function Sidebar({ isOpen, onClose }: Props) {
  const user   = useAuthStore(s => s.user);
  const logout = useLogout();

  const visibleItems = navItems.filter(
    item => !item.roles || (user?.role && item.roles.includes(user.role))
  );

  return (
    <aside className={`
      fixed inset-y-0 left-0 z-30 w-60 bg-espresso
      flex flex-col transition-transform duration-300
      ${isOpen ? 'translate-x-0' : '-translate-x-full'}
      lg:translate-x-0 lg:static lg:z-auto
    `}>

      {/* ── Logo ─────────────────────────────── */}
      <div className="flex items-center justify-between px-5 py-5 border-b border-white/10 shrink-0">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 bg-caramel rounded-lg flex items-center justify-center shrink-0">
            <Coffee size={16} className="text-white" />
          </div>
          <div>
            <p className="text-white font-semibold text-sm leading-tight">Luis Coffee</p>
            <p className="text-white/40 text-xs">Break POS</p>
          </div>
        </div>
        {/* Cerrar en móvil */}
        <button
          onClick={onClose}
          className="lg:hidden text-white/50 hover:text-white transition-colors p-1"
        >
          <X size={18} />
        </button>
      </div>

      {/* ── Nav ──────────────────────────────── */}
      <nav className="flex-1 px-3 py-4 space-y-0.5 overflow-y-auto">
        {visibleItems.map((item) => (
          <NavLink
            key={item.path}
            to={item.path}
            onClick={onClose}
            className={({ isActive }) => `
              flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium
              transition-colors
              ${isActive
                ? 'bg-caramel text-white'
                : 'text-white/60 hover:text-white hover:bg-white/10'
              }
            `}
          >
            <item.icon size={18} />
            {item.label}
          </NavLink>
        ))}
      </nav>

      {/* ── Usuario + logout ─────────────────── */}
      <div className="px-4 py-4 border-t border-white/10 shrink-0">
        <div className="flex items-center gap-3 mb-3 px-1">
          <div className="w-8 h-8 bg-caramel/30 rounded-full flex items-center justify-center shrink-0">
            <span className="text-white text-xs font-bold">
              {user?.name.charAt(0).toUpperCase()}
            </span>
          </div>
          <div className="overflow-hidden">
            <p className="text-white text-sm font-medium truncate">{user?.name}</p>
            <p className="text-white/40 text-xs">{user?.role}</p>
          </div>
        </div>
        <button
          onClick={logout}
          className="
            w-full flex items-center gap-2 px-3 py-2
            text-white/50 hover:text-white/90 hover:bg-white/10
            rounded-lg text-xs font-medium transition-colors
          "
        >
          <LogOut size={14} />
          Cerrar sesión
        </button>
      </div>
    </aside>
  );
}