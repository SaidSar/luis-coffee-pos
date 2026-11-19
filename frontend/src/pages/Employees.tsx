import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { UserPlus, Pencil, Power, RotateCcw, KeyRound, Wallet, Eye } from 'lucide-react';
import { useAuthStore } from '../stores/authStore';
import { usePeriod } from '../hooks/usePeriod';
import { useEmployees, useSetEmployeeActive, useResetPassword } from '../hooks/useEmployees';
import { describeEmployeeError } from '../lib/apiError';
import type { Employee, EmployeeRole, TempPasswordResult } from '../types/employees';
import PeriodSelector from '../components/reports/PeriodSelector';
import ReportBlock from '../components/reports/ReportBlock';
import DataTable from '../components/reports/DataTable';
import { formatMoney, int, card, focusRing } from '../components/reports/reportUi';
import { EmployeeFormDialog, TempPasswordDialog, ConfirmDialog, PayrollDialog } from '../components/employees/EmployeeDialogs';
import { ROLE_OPTIONS, ROLE_ES, lastLogin } from '../components/employees/employeeUi';
import StatusBadge from '../components/employees/StatusBadge';


const act = `inline-flex items-center justify-center gap-1 min-h-11 px-3 rounded-xl text-xs font-semibold border border-espresso/40 bg-white text-espresso hover:bg-cream disabled:opacity-50 disabled:cursor-not-allowed ${focusRing}`;
const select = `w-full min-h-11 px-3 rounded-xl border border-espresso/50 bg-white text-espresso text-sm focus:outline-none focus:ring-2 focus:ring-caramel-dark`;

type Confirm = { kind: 'toggle' | 'reset'; emp: Employee } | null;

export default function Employees() {
  const me = useAuthStore((s) => s.user?.id);
  const { preset, range, selectPreset, selectCustom } = usePeriod('thisMonth');
  const [searchInput, setSearchInput] = useState('');
  const [search, setSearch] = useState('');
  const [role, setRole]     = useState<EmployeeRole | ''>('');
  const [active, setActive] = useState<'' | 'true' | 'false'>('');
  useEffect(() => { const t = setTimeout(() => setSearch(searchInput.trim()), 300); return () => clearTimeout(t); }, [searchInput]);

  const list = useEmployees({ ...range, search: search || undefined, role: role || undefined, active: active || undefined });
  const toggle = useSetEmployeeActive();
  const reset  = useResetPassword();

  const [form, setForm]       = useState<Employee | null | undefined>(undefined); // undefined cerrado, null nuevo
  const [temp, setTemp]       = useState<{ result: TempPasswordResult; reason: 'created' | 'reset' } | null>(null);
  const [confirm, setConfirm] = useState<Confirm>(null);
  const [payroll, setPayroll] = useState<Employee | null>(null);
  const [announcement, setAnnouncement] = useState('');
  const announce = (m: string) => setAnnouncement((p) => (p === m ? `${m} ` : m));
  const busy = useRef(false);

  // Tras acciones que quitan o reemplazan el botón de origen, el foco va a un control que sigue existiendo
  const focusNext = useRef<string | null>(null);
  const anyDialog = form !== undefined || !!temp || !!confirm || !!payroll;
  useEffect(() => {
    if (anyDialog || !focusNext.current) return;
    const el = document.getElementById(focusNext.current);
    if (el) { el.focus(); focusNext.current = null; }
  });

  const closeForm = (r?: { created?: TempPasswordResult; updated?: Employee }) => {
    setForm(undefined);
    if (r?.created) { setTemp({ result: r.created, reason: 'created' }); announce(`Empleado ${r.created.employee.name} creado`); }
    if (r?.updated) announce(`Empleado ${r.updated.name} actualizado`);
  };
  const closeTemp = () => {
    const t = temp; setTemp(null);
    focusNext.current = t?.reason === 'reset' ? `emp-reset-${t.result.employee.id}` : 'emp-new';
  };

  const runConfirm = () => {
    if (!confirm || busy.current) return;
    busy.current = true;
    const { kind, emp } = confirm;
    if (kind === 'toggle') {
      toggle.mutate({ id: emp.id, active: !emp.active }, {
        onSuccess: (u) => { focusNext.current = `emp-toggle-${u.id}`; setConfirm(null); announce(`${u.name} ${u.active ? 'activado' : 'desactivado'}`); },
        onSettled: () => { busy.current = false; },
      });
    } else {
      reset.mutate(emp.id, {
        onSuccess: (r) => { setConfirm(null); setTemp({ result: r, reason: 'reset' }); announce(`Contraseña de ${emp.name} restablecida`); },
        onSettled: () => { busy.current = false; },
      });
    }
  };
  const closePayroll = (saved: boolean) => {
    const e = payroll; setPayroll(null);
    if (saved && e) announce(`Nómina de ${e.name} registrada`);
  };

  const rows = list.data ?? [];
  const selfReason = 'No disponible en tu propia cuenta';

  return (
    <div className="flex flex-col gap-4 min-w-0">
      <p className="sr-only" role="status" aria-live="polite">{announcement}</p>

      <section aria-labelledby="emp-period-title" className={`${card} flex flex-col gap-3`}>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 id="emp-period-title" className="text-base font-bold text-espresso">Periodo de estadísticas</h2>
          <button id="emp-new" type="button" onClick={() => setForm(null)}
            className={`inline-flex items-center justify-center gap-2 min-h-11 px-5 rounded-xl text-sm font-semibold bg-caramel-dark hover:bg-espresso text-white ${focusRing}`}>
            <UserPlus size={16} aria-hidden="true" /> Nuevo empleado
          </button>
        </div>
        <PeriodSelector key={`${range.from}_${range.to}`} value={range} preset={preset} onPreset={selectPreset} onCustom={selectCustom}
          label="Periodo de las estadísticas de empleados" idPrefix="emp" />
        <div className="grid gap-3 sm:grid-cols-3">
          <div>
            <label htmlFor="emp-search" className="block text-sm font-medium text-espresso mb-1">Buscar por nombre o correo</label>
            <input id="emp-search" type="search" value={searchInput} onChange={(e) => setSearchInput(e.target.value)} className={select} autoComplete="off" />
          </div>
          <div>
            <label htmlFor="emp-filter-role" className="block text-sm font-medium text-espresso mb-1">Rol</label>
            <select id="emp-filter-role" value={role} onChange={(e) => setRole(e.target.value as EmployeeRole | '')} className={select}>
              <option value="">Todos</option>
              {ROLE_OPTIONS.map((r) => <option key={r.value} value={r.value}>{r.label}</option>)}
            </select>
          </div>
          <div>
            <label htmlFor="emp-filter-active" className="block text-sm font-medium text-espresso mb-1">Estado</label>
            <select id="emp-filter-active" value={active} onChange={(e) => setActive(e.target.value as '' | 'true' | 'false')} className={select}>
              <option value="">Todos</option><option value="true">Activos</option><option value="false">Inactivos</option>
            </select>
          </div>
        </div>
      </section>

      <ReportBlock title="Empleados" titleId="emp-list-title" isLoading={list.isLoading} error={list.error}
        isEmpty={!rows.length} emptyText="No hay empleados con esos filtros" onRetry={() => list.refetch()}>
        <DataTable<Employee>
          caption="Empleados y sus ventas del periodo"
          rows={rows}
          rowKey={(e) => e.id}
          columns={[
            { header: 'Nombre', rowHeader: true, cell: (e) => (
              <span className="block min-w-36">
                {e.name}{e.id === me && <span className="text-xs text-espresso/70"> (tú)</span>}
                {e.mustChangePassword && <span className="block text-xs text-amber-900">Contraseña temporal pendiente</span>}
              </span>
            ) },
            { header: 'Correo', cell: (e) => e.email },
            { header: 'Rol', cell: (e) => ROLE_ES[e.role] ?? e.role },
            { header: 'Estado', cell: (e) => <StatusBadge active={e.active} /> },
            { header: 'Última sesión', cell: (e) => lastLogin(e.lastLoginAt) },
            { header: 'Ventas', align: 'right', cell: (e) => formatMoney(e.stats?.sales ?? 0) },
            { header: 'Tickets', align: 'right', cell: (e) => int.format(e.stats?.tickets ?? 0) },
            { header: 'Acciones', cell: (e) => {
              const self = e.id === me;
              return (
                <span className="flex flex-wrap gap-1 min-w-72">
                  <Link to={`/employees/${e.id}`} className={act} aria-label={`Ver detalle de ${e.name}`}><Eye size={14} aria-hidden="true" /> Detalle</Link>
                  <button type="button" className={act} onClick={() => setForm(e)} aria-label={`Editar a ${e.name}`}><Pencil size={14} aria-hidden="true" /> Editar</button>
                  <button id={`emp-toggle-${e.id}`} type="button" className={act} disabled={self}
                    aria-label={`${e.active ? 'Desactivar' : 'Activar'} a ${e.name}`} aria-describedby={self ? `emp-self-${e.id}` : undefined}
                    onClick={() => { toggle.reset(); setConfirm({ kind: 'toggle', emp: e }); }}>
                    {e.active ? <Power size={14} aria-hidden="true" /> : <RotateCcw size={14} aria-hidden="true" />} {e.active ? 'Desactivar' : 'Activar'}
                  </button>
                  <button id={`emp-reset-${e.id}`} type="button" className={act} disabled={self}
                    aria-label={`Restablecer contraseña de ${e.name}`} aria-describedby={self ? `emp-self-${e.id}` : undefined}
                    onClick={() => { reset.reset(); setConfirm({ kind: 'reset', emp: e }); }}>
                    <KeyRound size={14} aria-hidden="true" /> Restablecer
                  </button>
                  <button type="button" className={act} onClick={() => setPayroll(e)} aria-label={`Registrar nómina de ${e.name}`}><Wallet size={14} aria-hidden="true" /> Nómina</button>
                  {self && <span id={`emp-self-${e.id}`} className="basis-full text-xs text-espresso/70">{selfReason}: desactivar y restablecer. Usa “Cambiar contraseña”.</span>}
                </span>
              );
            } },
          ]}
        />
      </ReportBlock>

      {form !== undefined && <EmployeeFormDialog employee={form} isSelf={!!form && form.id === me} onClose={closeForm} />}
      {temp && <TempPasswordDialog result={temp.result} reason={temp.reason} onClose={closeTemp} />}
      {payroll && <PayrollDialog employee={payroll} onClose={closePayroll} />}
      {confirm?.kind === 'toggle' && (
        <ConfirmDialog
          title={confirm.emp.active ? `¿Desactivar a ${confirm.emp.name}?` : `¿Activar a ${confirm.emp.name}?`}
          description={confirm.emp.active
            ? 'No podrá iniciar sesión y su sesión actual se cerrará al instante. Sus ventas y registros se conservan.'
            : 'Podrá volver a iniciar sesión con su contraseña actual.'}
          confirmLabel={confirm.emp.active ? 'Sí, desactivar' : 'Sí, activar'} pendingLabel="Guardando..." danger={confirm.emp.active}
          pending={toggle.isPending} error={toggle.error ? describeEmployeeError(toggle.error) : null}
          onConfirm={runConfirm} onClose={() => setConfirm(null)} />
      )}
      {confirm?.kind === 'reset' && (
        <ConfirmDialog
          title={`¿Restablecer la contraseña de ${confirm.emp.name}?`}
          description="Se generará una contraseña temporal nueva, se cerrarán sus sesiones y deberá cambiarla al ingresar."
          confirmLabel="Sí, restablecer" pendingLabel="Restableciendo..." danger
          pending={reset.isPending} error={reset.error ? describeEmployeeError(reset.error) : null}
          onConfirm={runConfirm} onClose={() => setConfirm(null)} />
      )}
    </div>
  );
}
