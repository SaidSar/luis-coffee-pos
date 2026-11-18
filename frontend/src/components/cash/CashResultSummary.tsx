import { formatMXN } from '../../types';
import type { CashCloseResult } from '../../types/cash';
import { resultMeta } from './cashUi';

// Resumen del corte: esperado, contado y diferencia con texto + ícono (no solo color)
export default function CashResultSummary({ data, headingId, headingLevel = 3 }: {
  data: CashCloseResult; headingId?: string; headingLevel?: 2 | 3;
}) {
  const meta = resultMeta[data.result];
  const Icon = meta.icon;
  const diff = Number(data.shift.difference ?? 0);
  const H = headingLevel === 2 ? 'h2' : 'h3';
  return (
    <div className="flex flex-col gap-3">
      <H id={headingId} tabIndex={-1} className="text-base font-bold text-espresso focus:outline-none">Resultado del corte</H>
      <p className={`inline-flex items-center gap-2 self-start rounded-full border px-3 py-1 text-sm font-semibold ${meta.className}`}>
        <Icon size={16} aria-hidden="true" /> {meta.label}
      </p>
      <p className="text-sm text-espresso">{meta.explain(formatMXN(Math.abs(diff)))}</p>
      <dl className="grid grid-cols-[minmax(0,1fr)_auto] gap-x-4 gap-y-1 text-sm text-espresso">
        <dt>Fondo inicial</dt><dd className="text-right tabular-nums">{formatMXN(data.shift.openingFloat)}</dd>
        <dt>Ventas en efectivo</dt><dd className="text-right tabular-nums">{formatMXN(data.sales.CASH)}</dd>
        <dt>Gastos pagados de caja</dt><dd className="text-right tabular-nums">{Number(data.cashExpenses.total) > 0 ? '−' : ''}{formatMXN(data.cashExpenses.total)}</dd>
        <dt className="font-semibold">Efectivo esperado</dt><dd className="text-right tabular-nums font-semibold">{formatMXN(data.shift.expectedCash ?? '0')}</dd>
        <dt className="font-semibold">Efectivo contado</dt><dd className="text-right tabular-nums font-semibold">{formatMXN(data.shift.countedCash ?? '0')}</dd>
        <dt className="font-semibold">Diferencia</dt>
        <dd className="text-right tabular-nums font-semibold">{diff > 0 ? '+' : diff < 0 ? '−' : ''}{formatMXN(Math.abs(diff))}</dd>
      </dl>
      {data.warning && <p className="text-sm text-amber-900 bg-amber-50 rounded-lg px-3 py-2">{data.warning}.</p>}
    </div>
  );
}
