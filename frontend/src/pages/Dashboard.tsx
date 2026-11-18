import { Link } from 'react-router-dom';
import {
  ArrowUp, ArrowDown, Minus, LayoutGrid, Receipt, Bike, Lock, LockOpen, PackageX, ChevronRight, Loader2, RefreshCw,
  type LucideIcon,
} from 'lucide-react';
import { useAuthStore } from '../stores/authStore';
import { useDashboard } from '../hooks/useDashboard';
import { describeApiError } from '../lib/apiError';
import { REPORT_TZ } from '../lib/mazatlanDates';
import type { DashboardData } from '../types/dashboard';
import BarChart from '../components/dashboard/BarChart';
import { formatMoney, int, PAYMENT_LABEL, ROLE_LABEL, card, focusRing } from '../components/reports/reportUi';
import { btnSecondary } from '../components/pos/posUi';

const pctFmt = new Intl.NumberFormat('es-MX', { style: 'percent', maximumFractionDigits: 0 });
const timeFmt = new Intl.DateTimeFormat('es-MX', { timeZone: REPORT_TZ, hour: '2-digit', minute: '2-digit' });
const dayFmt = new Intl.DateTimeFormat('es-MX', { timeZone: 'UTC', weekday: 'short', day: 'numeric' });

// "↑ 12 % vs ayer a esta hora": texto + flecha (nunca solo color)
function Comparison({ c, today }: { c: NonNullable<DashboardData['sales']>['comparison']; today: number }) {
  let Icon: LucideIcon = Minus, text: string, tone = 'text-espresso';
  if (c.pct === null) {
    text = today > 0 ? 'Ayer a esta hora no había ventas' : 'Sin ventas hoy ni ayer a esta hora';
  } else if (c.delta > 0) {
    Icon = ArrowUp; tone = 'text-green-800';
    text = `${pctFmt.format(c.pct)} más que ayer a esta hora (${formatMoney(c.delta)})`;
  } else if (c.delta < 0) {
    Icon = ArrowDown; tone = 'text-red-700';
    text = `${pctFmt.format(Math.abs(c.pct))} menos que ayer a esta hora (${formatMoney(Math.abs(c.delta))})`;
  } else {
    text = 'Igual que ayer a esta hora';
  }
  return (
    <dd className={`flex items-start gap-1 text-xs font-medium ${tone}`}>
      <Icon size={14} className="shrink-0 mt-0.5" aria-hidden="true" />
      <span>{text}. Ayer a esta hora: {formatMoney(c.yesterdaySameTime)}.</span>
    </dd>
  );
}

function OpsCard({ to, icon: Icon, title, value, detail, linkLabel }: {
  to: string; icon: LucideIcon; title: string; value: string; detail: string; linkLabel: string;
}) {
  return (
    <li>
      <Link to={to} aria-label={`${title}: ${value}. ${detail}. ${linkLabel}`}
        className={`${card} min-h-11 flex items-center gap-3 hover:bg-cream/60 transition-colors ${focusRing}`}>
        <span className="w-10 h-10 rounded-xl bg-cream flex items-center justify-center shrink-0">
          <Icon size={20} className="text-espresso" aria-hidden="true" />
        </span>
        <span className="flex-1 min-w-0">
          <span className="block text-sm text-espresso/70">{title}</span>
          <span className="block text-lg font-bold text-espresso tabular-nums">{value}</span>
          <span className="block text-xs text-espresso/70">{detail}</span>
        </span>
        <ChevronRight size={18} className="text-espresso/70 shrink-0" aria-hidden="true" />
      </Link>
    </li>
  );
}

// Esqueleto mientras carga (aria-busy en la región)
function Skeleton() {
  return (
    <div aria-busy="true" aria-live="polite" className="flex flex-col gap-4">
      <p className="sr-only">Cargando indicadores…</p>
      <div className="grid grid-cols-2 xl:grid-cols-4 gap-3">
        {[0, 1, 2, 3].map((i) => <div key={i} className="h-24 rounded-2xl bg-white border border-caramel/10 animate-pulse" />)}
      </div>
      <div className="h-48 rounded-2xl bg-white border border-caramel/10 animate-pulse" />
    </div>
  );
}

export default function Dashboard() {
  const user = useAuthStore((s) => s.user);
  const q = useDashboard();
  const d = q.data;

  return (
    <div className="flex flex-col gap-4 min-w-0">
      <section className={`${card} flex flex-wrap items-center justify-between gap-3`} aria-labelledby="dash-hello">
        <div>
          <h2 id="dash-hello" className="text-lg font-bold text-espresso">Hola, {user?.name}</h2>
          <p className="text-sm text-espresso/70">{user?.role ? ROLE_LABEL[user.role] : ''} · Resumen de hoy (hora de Mazatlán)</p>
        </div>
        {d && (
          <p className="text-xs text-espresso/70 flex items-center gap-1" aria-live="polite">
            {q.isFetching
              ? <><Loader2 size={12} className="animate-spin" aria-hidden="true" /> Actualizando…</>
              : <>Actualizado a las {timeFmt.format(new Date(d.generatedAt))}</>}
          </p>
        )}
      </section>

      {q.isLoading && <Skeleton />}

      {q.error && !q.isFetching && (
        <div role="alert" className="flex flex-wrap items-center gap-3 text-sm text-red-700 bg-red-50 rounded-xl px-3 py-2">
          <span>{describeApiError(q.error, 'load').message}{d ? ' Se muestran los últimos datos recibidos.' : ''}</span>
          <button type="button" onClick={() => q.refetch()} className={btnSecondary}>
            <RefreshCw size={16} aria-hidden="true" /> Reintentar
          </button>
        </div>
      )}

      {d && <DashboardBody d={d} />}
    </div>
  );
}

function DashboardBody({ d }: { d: DashboardData }) {
  const { operations: op, sales, finance } = d;
  const noSales = sales && sales.tickets === 0;
  const pendingDeliveries = op.deliveries.PENDING + op.deliveries.IN_TRANSIT;

  return (
    <>
      {sales && (
        <section aria-labelledby="dash-kpis-title" className="flex flex-col gap-3">
          <h2 id="dash-kpis-title" className="sr-only">Indicadores de ventas de hoy</h2>
          <dl className="grid grid-cols-1 min-[420px]:grid-cols-2 xl:grid-cols-4 gap-3">
            <div className={`${card} flex flex-col gap-1 min-w-0`}>
              <dt className="text-sm text-espresso/70">Ventas de hoy</dt>
              <dd className="text-2xl font-bold text-espresso tabular-nums">{formatMoney(sales.total)}</dd>
              <Comparison c={sales.comparison} today={sales.total} />
            </div>
            <div className={`${card} flex flex-col gap-1`}>
              <dt className="text-sm text-espresso/70">Tickets</dt>
              <dd className="text-2xl font-bold text-espresso tabular-nums">{int.format(sales.tickets)}</dd>
              <dd className="text-xs text-espresso/70">Ayer a esta hora: {int.format(sales.comparison.yesterdayTickets)}</dd>
            </div>
            <div className={`${card} flex flex-col gap-1`}>
              <dt className="text-sm text-espresso/70">Ticket promedio</dt>
              <dd className="text-2xl font-bold text-espresso tabular-nums">{formatMoney(sales.averageTicket)}</dd>
            </div>
            {finance && (
              <div className={`${card} flex flex-col gap-1`}>
                <dt className="text-sm text-espresso/70">Utilidad de hoy</dt>
                <dd className={`text-2xl font-bold tabular-nums ${finance.profit < 0 ? 'text-red-700' : 'text-espresso'}`}>
                  {formatMoney(finance.profit)}{finance.profit < 0 && <span className="sr-only"> (pérdida)</span>}
                </dd>
                <dd className="text-xs text-espresso/70">Costo {formatMoney(finance.cost)} · Gastos {formatMoney(finance.expenses)}</dd>
              </div>
            )}
          </dl>
          {noSales && <p className={`${card} text-sm text-espresso`}>Aún no hay ventas hoy.</p>}
        </section>
      )}

      <section aria-labelledby="dash-ops-title" className="flex flex-col gap-2">
        <h2 id="dash-ops-title" className="text-base font-bold text-espresso">Operación en vivo</h2>
        <ul className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-3">
          <OpsCard to="/pos" icon={LayoutGrid} title="Mesas ocupadas" value={`${op.tables.occupied} de ${op.tables.total}`}
            detail="Las mesas unidas cuentan como una" linkLabel="Ir al punto de venta" />
          <OpsCard to="/pos" icon={Receipt} title={op.activeOrders.scope === 'mine' ? 'Mis órdenes sin cobrar' : 'Órdenes sin cobrar'}
            value={int.format(op.activeOrders.count)} detail={`Pendiente ${formatMoney(op.activeOrders.pending)}`} linkLabel="Ir al punto de venta" />
          <OpsCard to="/deliveries" icon={Bike} title="Entregas activas" value={int.format(pendingDeliveries)}
            detail={`${op.deliveries.PENDING} pendientes · ${op.deliveries.IN_TRANSIT} en camino`} linkLabel="Ir a entregas" />
          <OpsCard to="/cash" icon={op.cash.open ? LockOpen : Lock} title="Caja" value={op.cash.open ? 'Abierta' : 'Cerrada'}
            detail={op.cash.open && op.cash.openedAt ? `Desde las ${timeFmt.format(new Date(op.cash.openedAt))}` : 'Sin turno abierto'} linkLabel="Ir a caja" />
        </ul>
      </section>

      {(sales || finance) && (
        <div className="grid gap-4 xl:grid-cols-2 min-w-0">
          {sales && (
            <section aria-labelledby="dash-hours-title" className={`${card} flex flex-col gap-2 min-w-0`}>
              <h2 id="dash-hours-title" className="text-base font-bold text-espresso">Ventas por hora de hoy</h2>
              <BarChart title="Ventas por hora de hoy" unitName="hora" tableCaption="Ventas por hora de hoy" axisEvery={3}
                data={sales.byHour.map((h) => ({ key: String(h.hour), label: `${h.hour}h`, value: h.sales, tickets: h.tickets }))} />
            </section>
          )}
          {finance && (
            <section aria-labelledby="dash-week-title" className={`${card} flex flex-col gap-2 min-w-0`}>
              <h2 id="dash-week-title" className="text-base font-bold text-espresso">Últimos 7 días</h2>
              <BarChart title="Ventas de los últimos 7 días" unitName="día" tableCaption="Ventas de los últimos 7 días"
                data={finance.last7Days.map((x) => ({ key: x.date, label: dayFmt.format(new Date(`${x.date}T12:00:00Z`)), value: x.sales, tickets: x.tickets }))} />
            </section>
          )}
        </div>
      )}

      {sales && (
        <div className="grid gap-4 md:grid-cols-2 min-w-0">
          <section aria-labelledby="dash-top-title" className={`${card} flex flex-col gap-2`}>
            <h2 id="dash-top-title" className="text-base font-bold text-espresso">Productos más vendidos hoy</h2>
            {sales.topProducts.length === 0 ? <p className="text-sm text-espresso/70">Aún no hay ventas hoy.</p> : (
              <ol className="flex flex-col divide-y divide-espresso/10 text-sm text-espresso">
                {sales.topProducts.map((p, i) => (
                  <li key={p.productId} className="py-2 flex justify-between gap-3">
                    <span className="min-w-0 break-words">{i + 1}. {p.name}</span>
                    <span className="shrink-0 tabular-nums">{int.format(p.quantity)} u · {formatMoney(p.sales)}</span>
                  </li>
                ))}
              </ol>
            )}
          </section>
          <section aria-labelledby="dash-methods-title" className={`${card} flex flex-col gap-2`}>
            <h2 id="dash-methods-title" className="text-base font-bold text-espresso">Métodos de pago de hoy</h2>
            {sales.byMethod.length === 0 ? <p className="text-sm text-espresso/70">Aún no hay ventas hoy.</p> : (
              <ul className="flex flex-col divide-y divide-espresso/10 text-sm text-espresso">
                {sales.byMethod.map((m) => (
                  <li key={m.method} className="py-2 flex justify-between gap-3">
                    <span>{PAYMENT_LABEL[m.method]}</span>
                    <span className="tabular-nums">{formatMoney(m.sales)} · {int.format(m.tickets)} {m.tickets === 1 ? 'orden' : 'órdenes'}</span>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>
      )}

      <section aria-labelledby="dash-stock-title" className={`${card} flex flex-col gap-2`}>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 id="dash-stock-title" className="flex items-center gap-2 text-base font-bold text-espresso">
            <PackageX size={18} aria-hidden="true" /> Stock bajo
            <span className="text-sm font-normal text-espresso/70">(≤ {op.lowStock.threshold} unidades)</span>
          </h2>
          <Link to="/inventory" className={`inline-flex items-center min-h-11 text-sm font-semibold text-caramel-dark underline rounded ${focusRing}`}>
            Ir a inventario
          </Link>
        </div>
        {op.lowStock.items.length === 0 ? <p className="text-sm text-espresso/70">Ningún producto con control de stock está por agotarse.</p> : (
          <ul className="flex flex-col divide-y divide-espresso/10 text-sm text-espresso">
            {op.lowStock.items.map((p) => (
              <li key={p.id} className="py-2 flex justify-between gap-3">
                <span className="min-w-0 break-words">{p.name}</span>
                <span className={`shrink-0 font-semibold tabular-nums ${p.stock === 0 ? 'text-red-700' : ''}`}>
                  {p.stock === 0 ? 'Agotado' : `${p.stock} en stock`}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </>
  );
}
