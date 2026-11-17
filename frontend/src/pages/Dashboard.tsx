import { useAuthStore } from '../stores/authStore';

const roleLabels: Record<string, string> = {
  ADMIN:    'Administrador',
  CASHIER:  'Cajero',
  WAITER:   'Mesero',
  DELIVERY: 'Repartidor',
};

const statCards = [
  { label: 'Ventas hoy',    value: '$0.00', color: 'bg-caramel'    },
  { label: 'Pedidos hoy',   value: '0',     color: 'bg-espresso'   },
  { label: 'Productos',     value: '0',     color: 'bg-amber'      },
  { label: 'Mesas activas', value: '0',     color: 'bg-caramel/60' },
];

export default function Dashboard() {
  const user = useAuthStore(s => s.user);

  return (
    <div className="space-y-6">

      {/* Bienvenida */}
      <div className="bg-white rounded-2xl border border-caramel/10 p-6">
        <div className="flex items-center gap-4">
          <div className="w-12 h-12 bg-espresso rounded-xl flex items-center justify-center shrink-0">
            <span className="text-white font-bold text-lg">
              {user?.name.charAt(0).toUpperCase()}
            </span>
          </div>
          <div>
            <h2 className="text-xl font-bold text-espresso">
              Bienvenido, {user?.name} 👋
            </h2>
            <p className="text-caramel-dark text-sm">
              {user?.role ? roleLabels[user.role] : ''} · Luis Coffee Break POS
            </p>
          </div>
        </div>
      </div>

      {/* Métricas */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {statCards.map((stat) => (
          <div
            key={stat.label}
            className="bg-white rounded-2xl border border-caramel/10 p-5"
          >
            <div className={`w-8 h-8 ${stat.color} rounded-lg mb-3`} />
            <p className="text-2xl font-bold text-espresso">{stat.value}</p>
            <p className="text-sm text-espresso/70 mt-1">{stat.label}</p>
          </div>
        ))}
      </div>

    </div>
  );
}