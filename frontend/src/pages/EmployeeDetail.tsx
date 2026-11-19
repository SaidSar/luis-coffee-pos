import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { ArrowLeft, Wallet, Loader2 } from 'lucide-react';
import { usePeriod } from '../hooks/usePeriod';
import { useEmployee } from '../hooks/useEmployees';
import { describeEmployeeError } from '../lib/apiError';
import { formatYmd } from '../lib/mazatlanDates';
import PeriodSelector from '../components/reports/PeriodSelector';
import DataTable from '../components/reports/DataTable';
import { formatMoney, int, card, focusRing } from '../components/reports/reportUi';
import { btnPrimary, btnSecondary } from '../components/pos/posUi';
import { PayrollDialog } from '../components/employees/EmployeeDialogs';
import { ROLE_ES, lastLogin } from '../components/employees/employeeUi';
import StatusBadge from '../components/employees/StatusBadge';
import type { EmployeeDetail as Detail } from '../types/employees';

export default function EmployeeDetail() {
  const { id } = useParams();
  const { preset, range, selectPreset, selectCustom } = usePeriod('thisMonth');
  const q = useEmployee(id, range);
  const e = q.data;
  const [paying, setPaying] = useState(false);
  const [announcement, setAnnouncement] = useState('');

  return (
    <div className="flex flex-col gap-4 min-w-0">
      <p className="sr-only" role="status" aria-live="polite">{announcement}</p>
      <Link to="/employees" className={`inline-flex items-center gap-2 min-h-11 self-start text-sm font-semibold text-caramel-dark underline rounded ${focusRing}`}>
        <ArrowLeft size={16} aria-hidden="true" /> Volver a empleados
      </Link>

      {q.isLoading && <p role="status" className={`${card} flex items-center gap-2 text-sm text-espresso/70`}><Loader2 size={16} className="animate-spin" aria-hidden="true" /> Cargando empleado...</p>}
      {q.error && (
        <div role="alert" className="flex flex-wrap items-center gap-3 text-sm text-red-700 bg-red-50 rounded-xl px-3 py-2">
          {describeEmployeeError(q.error)}
          <button type="button" onClick={() => q.refetch()} className={btnSecondary}>Reintentar</button>
        </div>
      )}

      {e && (
        <>
          <section aria-labelledby="emp-d-title" className={`${card} flex flex-wrap items-start justify-between gap-3`}>
            <div className="flex flex-col gap-1">
              <h2 id="emp-d-title" className="text-lg font-bold text-espresso">{e.name}</h2>
              <p className="text-sm text-espresso">{e.email} · {ROLE_ES[e.role] ?? e.role}</p>
              <p className="flex flex-wrap items-center gap-2 text-sm text-espresso/70"><StatusBadge active={e.active} /> Última sesión: {lastLogin(e.lastLoginAt)}</p>
            </div>
            <button type="button" onClick={() => setPaying(true)} className={btnPrimary}><Wallet size={16} aria-hidden="true" /> Registrar nómina</button>
          </section>

          <section aria-labelledby="emp-d-period" className={`${card} flex flex-col gap-3`}>
            <h2 id="emp-d-period" className="text-base font-bold text-espresso">Periodo</h2>
            <PeriodSelector key={`${range.from}_${range.to}`} value={range} preset={preset} onPreset={selectPreset} onCustom={selectCustom}
              label="Periodo de las estadísticas del empleado" idPrefix="emp-d" />
          </section>

          {e.stats && (
            <dl className="grid grid-cols-2 lg:grid-cols-4 gap-3">
              {[
                ['Ventas', formatMoney(e.stats.sales)], ['Tickets', int.format(e.stats.tickets)],
                ['Ticket promedio', formatMoney(e.stats.averageTicket)], ['Órdenes tomadas', int.format(e.stats.ordersTaken)],
                ['Entregas', int.format(e.stats.deliveries)], ['Turnos de caja cerrados', int.format(e.stats.shiftsClosed)],
                ['Nómina pagada', formatMoney(e.stats.payroll)],
              ].map(([k, v]) => (
                <div key={k} className={`${card} flex flex-col gap-1`}>
                  <dt className="text-sm text-espresso/70">{k}</dt>
                  <dd className="text-xl font-bold text-espresso tabular-nums">{v}</dd>
                </div>
              ))}
            </dl>
          )}

          <section aria-labelledby="emp-d-payroll" className={`${card} flex flex-col gap-2`}>
            <h2 id="emp-d-payroll" className="text-base font-bold text-espresso">Pagos de nómina del periodo</h2>
            {e.payroll.length === 0 ? <p className="text-sm text-espresso/70">Sin pagos de nómina en el periodo.</p> : (
              <DataTable<Detail['payroll'][number]>
                caption={`Pagos de nómina de ${e.name}`}
                rows={e.payroll}
                rowKey={(p) => p.id}
                columns={[
                  { header: 'Fecha', rowHeader: true, cell: (p) => formatYmd(p.date) },
                  { header: 'Monto', align: 'right', cell: (p) => formatMoney(p.amount) },
                  { header: 'De caja', cell: (p) => (p.paidFromCash ? 'Sí' : 'No') },
                  { header: 'Notas', cell: (p) => <span className="whitespace-normal block max-w-64">{p.notes ?? ''}</span> },
                  { header: 'Registró', cell: (p) => p.registeredBy.name },
                ]}
              />
            )}
          </section>
        </>
      )}

      {paying && e && (
        <PayrollDialog employee={e} onClose={(saved) => { setPaying(false); if (saved) setAnnouncement(`Nómina de ${e.name} registrada`); }} />
      )}
    </div>
  );
}
