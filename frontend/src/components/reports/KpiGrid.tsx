import type { ReportSummary } from '../../types/reports';
import { formatMoney, int, pct } from './reportUi';

interface Props { summary: ReportSummary }

// KPIs como lista de definiciones (texto, no solo visual)
export default function KpiGrid({ summary: s }: Props) {
  const items: { label: string; value: string; hint?: string; negative?: boolean }[] = [
    { label: 'Ventas',          value: formatMoney(s.sales) },
    { label: 'Tickets',         value: int.format(s.tickets), hint: `${int.format(s.itemsSold)} productos` },
    { label: 'Ticket promedio', value: formatMoney(s.averageTicket) },
    { label: 'Costo de ventas', value: formatMoney(s.cost), hint: `Margen ${pct.format(s.grossMarginPct)}` },
    { label: 'Gastos',          value: formatMoney(s.expenses) },
    { label: 'Utilidad',        value: formatMoney(s.profit), negative: s.profit < 0, hint: `${int.format(s.cancelledOrders)} órdenes canceladas` },
  ];
  return (
    <dl className="grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-3">
      {items.map((k) => (
        <div key={k.label} className="bg-white rounded-2xl border border-caramel/10 p-4 flex flex-col gap-1 min-w-0">
          <dt className="text-sm text-espresso/70">{k.label}</dt>
          <dd className={`text-xl font-bold tabular-nums break-words ${k.negative ? 'text-red-700' : 'text-espresso'}`}>
            {k.value}
            {k.negative && <span className="sr-only"> (pérdida)</span>}
          </dd>
          {k.hint && <dd className="text-xs text-espresso/70">{k.hint}</dd>}
        </div>
      ))}
    </dl>
  );
}
