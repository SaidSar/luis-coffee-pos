import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { Lock, LockOpen, Loader2, TriangleAlert } from 'lucide-react';
import { useAuthStore } from '../stores/authStore';
import { useCashCurrent, useCashShifts } from '../hooks/useCash';
import { usePeriod } from '../hooks/usePeriod';
import { describeApiError } from '../lib/apiError';
import { formatMXN } from '../types';
import type { CashCloseResult, CashShiftRow } from '../types/cash';
import OpenCashDialog from '../components/cash/OpenCashDialog';
import CloseCashDialog from '../components/cash/CloseCashDialog';
import CashResultSummary from '../components/cash/CashResultSummary';
import { formatDateTime, formatShiftSpan, resultMeta } from '../components/cash/cashUi';
import PeriodSelector from '../components/reports/PeriodSelector';
import ReportBlock from '../components/reports/ReportBlock';
import DataTable from '../components/reports/DataTable';
import { card, focusRing } from '../components/reports/reportUi';
import { btnPrimary, btnDark, btnSecondary } from '../components/pos/posUi';

const signed = (v: string | null) => {
  if (v === null) return '—';
  const n = Number(v);
  return `${n > 0 ? '+' : n < 0 ? '−' : ''}${formatMXN(Math.abs(n))}`;
};

export default function Cash() {
  const role    = useAuthStore((s) => s.user?.role);
  const isAdmin = role === 'ADMIN';
  const current = useCashCurrent();

  const [dialog, setDialog] = useState<'open' | 'close' | null>(null);
  // Datos del turno al abrir el diálogo de cierre: al cerrar, el refetch ya no trae turno abierto
  // y el diálogo debe seguir montado para mostrar el resultado
  const [closeCtx, setCloseCtx] = useState<{ pendingOrders: number; expectedCash?: string } | null>(null);
  const [lastClose, setLastClose] = useState<CashCloseResult | null>(null);
  const [announcement, setAnnouncement] = useState('');
  const announce = (msg: string) => setAnnouncement((prev) => (prev === msg ? `${msg} ` : msg));

  // El botón que abrió el diálogo desaparece al abrir/cerrar la caja: el foco va al nuevo encabezado
  // (en un efecto del padre, después de que el diálogo desmontado devuelva el foco)
  const focusAfter = useRef<string | null>(null);
  const data = current.data;
  useEffect(() => {
    if (dialog || !focusAfter.current) return;
    const el = document.getElementById(focusAfter.current);
    if (el) { focusAfter.current = null; el.focus(); }
  }, [dialog, data]);

  const closeOpenDialog = (opened: boolean) => {
    if (opened) { focusAfter.current = 'cash-open-title'; setLastClose(null); announce('Caja abierta'); }
    setDialog(null);
  };
  const closeCloseDialog = (result: CashCloseResult | null) => {
    if (result) { focusAfter.current = 'cash-last-close-title'; setLastClose(result); announce('Caja cerrada'); }
    setDialog(null);
  };

  return (
    <div className="flex flex-col gap-4 min-w-0">
      <p className="sr-only" role="status" aria-live="polite">{announcement}</p>

      {current.isLoading && (
        <p role="status" className={`${card} flex items-center gap-2 text-sm text-espresso/70`}>
          <Loader2 size={16} className="animate-spin" aria-hidden="true" /> Cargando caja...
        </p>
      )}

      {current.error && !current.isLoading && (
        <div role="alert" className="flex flex-wrap items-center gap-3 text-sm text-red-700 bg-red-50 rounded-lg px-3 py-2">
          {describeApiError(current.error, 'load').message}
          <button type="button" onClick={() => current.refetch()} className={btnSecondary}>Reintentar</button>
        </div>
      )}

      {lastClose && (
        <section aria-labelledby="cash-last-close-title" className={card}>
          <CashResultSummary data={lastClose} headingId="cash-last-close-title" headingLevel={2} />
        </section>
      )}

      {data && !data.open && (
        <section aria-labelledby="cash-closed-title" className={`${card} flex flex-col items-start gap-3`}>
          <h2 id="cash-closed-title" tabIndex={-1} className="flex items-center gap-2 text-base font-bold text-espresso focus:outline-none">
            <Lock size={18} aria-hidden="true" /> Caja cerrada
          </h2>
          <p className="text-sm text-espresso/70">No hay un turno abierto. Ábrelo con el efectivo inicial para empezar a registrar el corte.</p>
          <button type="button" onClick={() => setDialog('open')} className={btnPrimary}>
            <LockOpen size={16} aria-hidden="true" /> Abrir caja
          </button>
        </section>
      )}

      {data?.open && (
        <section aria-labelledby="cash-open-title" className={`${card} flex flex-col gap-4`}>
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h2 id="cash-open-title" tabIndex={-1} className="flex items-center gap-2 text-base font-bold text-espresso focus:outline-none">
                <LockOpen size={18} aria-hidden="true" /> Caja abierta
              </h2>
              <p className="text-sm text-espresso/70">
                Desde {formatDateTime(data.shift.openedAt)} (hora de Mazatlán) · abrió {data.shift.openedBy.name}
              </p>
            </div>
            <button
              type="button"
              onClick={() => { setCloseCtx({ pendingOrders: data.pendingOrders, expectedCash: isAdmin ? data.expectedCash : undefined }); setDialog('close'); }}
              className={btnDark}
            >
              <Lock size={16} aria-hidden="true" /> Cerrar caja
            </button>
          </div>

          <dl className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {[
              ['Fondo inicial', formatMXN(data.shift.openingFloat)],
              ['Efectivo', formatMXN(data.sales.CASH)],
              ['Tarjeta', formatMXN(data.sales.CARD)],
              ['Transferencia', formatMXN(data.sales.TRANSFER)],
              ['Ventas del turno', `${formatMXN(data.sales.total)} · ${data.sales.count} ${data.sales.count === 1 ? 'cobro' : 'cobros'}`],
              ['Gastos pagados de caja', `${formatMXN(data.cashExpenses.total)} · ${data.cashExpenses.count}`],
              ...(isAdmin && data.expectedCash !== undefined ? [['Efectivo esperado', formatMXN(data.expectedCash)]] : []),
            ].map(([label, value]) => (
              <div key={label} className="rounded-xl border border-espresso/15 px-3 py-2">
                <dt className="text-xs font-medium text-espresso/70">{label}</dt>
                <dd className="text-lg font-bold text-espresso tabular-nums">{value}</dd>
              </div>
            ))}
          </dl>

          {data.pendingOrders > 0 ? (
            <p className="flex flex-wrap items-center gap-2 text-sm text-amber-900 bg-amber-50 border border-amber-700/30 rounded-lg px-3 py-2">
              <TriangleAlert size={16} aria-hidden="true" />
              {data.pendingOrders} {data.pendingOrders === 1 ? 'orden pendiente' : 'órdenes pendientes'} de cobro.
              <Link to="/pos" className={`underline font-semibold rounded ${focusRing}`}>Ir al punto de venta</Link>
            </p>
          ) : (
            <p className="text-sm text-espresso/70">Sin órdenes pendientes de cobro.</p>
          )}
          {!isAdmin && <p className="text-xs text-espresso/70">El efectivo esperado se muestra después de capturar tu conteo al cerrar.</p>}
        </section>
      )}

      {isAdmin && <ShiftHistory />}

      {dialog === 'open' && <OpenCashDialog onClose={closeOpenDialog} />}
      {dialog === 'close' && closeCtx && (
        <CloseCashDialog pendingOrders={closeCtx.pendingOrders} expectedCash={closeCtx.expectedCash} onClose={closeCloseDialog} />
      )}
    </div>
  );
}

// Historial de cortes (solo ADMIN)
function ShiftHistory() {
  const { preset, range, selectPreset, selectCustom } = usePeriod('thisMonth');
  const shifts = useCashShifts(range, true);
  return (
    <>
      <section aria-labelledby="cash-history-period-title" className={`${card} flex flex-col gap-3`}>
        <h2 id="cash-history-period-title" className="text-base font-bold text-espresso">Periodo del historial</h2>
        <PeriodSelector key={`${range.from}_${range.to}`} value={range} preset={preset} onPreset={selectPreset}
          onCustom={selectCustom} label="Periodo del historial de cortes" idPrefix="cash" />
      </section>
      <ReportBlock
        title="Historial de cortes"
        titleId="cash-history-title"
        isLoading={shifts.isLoading}
        error={shifts.error}
        isEmpty={!shifts.data?.length}
        emptyText="Sin turnos en este periodo"
        onRetry={() => shifts.refetch()}
      >
        {shifts.data && (
          <DataTable<CashShiftRow>
            caption="Historial de cortes de caja"
            rows={shifts.data}
            rowKey={(s) => s.id}
            columns={[
              { header: 'Turno',      cell: (s) => formatShiftSpan(s.openedAt, s.closedAt), rowHeader: true },
              { header: 'Abrió',      cell: (s) => s.openedBy.name },
              { header: 'Cerró',      cell: (s) => s.closedBy?.name ?? '—' },
              { header: 'Fondo',      cell: (s) => formatMXN(s.openingFloat), align: 'right' },
              { header: 'Esperado',   cell: (s) => (s.expectedCash ? formatMXN(s.expectedCash) : '—'), align: 'right' },
              { header: 'Contado',    cell: (s) => (s.countedCash ? formatMXN(s.countedCash) : '—'), align: 'right' },
              { header: 'Diferencia', cell: (s) => signed(s.difference), align: 'right' },
              { header: 'Resultado',  cell: (s) => {
                if (!s.result) return 'Abierta';
                const m = resultMeta[s.result]; const Icon = m.icon;
                return <span className="inline-flex items-center gap-1"><Icon size={14} aria-hidden="true" /> {m.label}</span>;
              } },
              { header: 'Notas',      cell: (s) => <span className="whitespace-normal block max-w-64">{s.notes ?? ''}</span> },
            ]}
          />
        )}
      </ReportBlock>
    </>
  );
}
