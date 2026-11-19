import { useRef, useState } from 'react';
import { Loader2, Copy, Check, ShieldAlert } from 'lucide-react';
import { isAxiosError } from 'axios';
import { useDialog } from '../../hooks/useDialog';
import { useCreateEmployee, useUpdateEmployee, usePayroll } from '../../hooks/useEmployees';
import { describeEmployeeError, fieldErrorsFrom } from '../../lib/apiError';
import { todayInMazatlan } from '../../lib/mazatlanDates';
import type { Employee, EmployeeRole, TempPasswordResult } from '../../types/employees';
import { btnPrimary, btnSecondary, btnDanger, inputBase } from '../pos/posUi';
import { ROLE_OPTIONS } from './employeeUi';

const Overlay = ({ children }: { children: React.ReactNode }) => (
  <div className="fixed inset-0 bg-espresso/50 z-50 flex items-center justify-center p-4">{children}</div>
);
const panel = 'bg-white rounded-2xl w-full max-w-md max-h-[90dvh] overflow-y-auto p-6 flex flex-col gap-4 focus:outline-none';
const errCls = (bad: boolean) => `${inputBase} ${bad ? 'border-red-700' : ''}`;

// ── Alta / edición ───────────────────────────────────────────
export function EmployeeFormDialog({ employee, isSelf, onClose }: {
  employee: Employee | null; // null = nuevo
  isSelf: boolean;
  onClose: (r?: { created?: TempPasswordResult; updated?: Employee }) => void;
}) {
  const create = useCreateEmployee();
  const update = useUpdateEmployee();
  const pending = create.isPending || update.isPending;
  const submitting = useRef(false);
  const [form, setForm] = useState({ name: employee?.name ?? '', email: employee?.email ?? '', role: (employee?.role ?? 'WAITER') as EmployeeRole });
  const [errors, setErrors] = useState<Partial<Record<'name' | 'email' | 'role', string>>>({});
  const ref = useDialog<HTMLDivElement>(() => { if (!pending) onClose(); });

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (pending || submitting.current) return;
    const found: typeof errors = {};
    if (!form.name.trim()) found.name = 'El nombre es obligatorio.';
    else if (form.name.trim().length > 80) found.name = 'Máximo 80 caracteres.';
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email.trim())) found.email = 'Escribe un correo válido.';
    setErrors(found);
    const first = Object.keys(found)[0];
    if (first) { document.getElementById(`emp-${first}`)?.focus(); return; }
    submitting.current = true;
    const input = { name: form.name.trim(), email: form.email.trim(), role: form.role };
    const onError = (err: unknown) => {
      const fe = fieldErrorsFrom(err) as typeof errors;
      const code = isAxiosError(err) ? (err.response?.data as { details?: { code?: string } })?.details?.code : undefined;
      if (code === 'EMAIL_TAKEN') fe.email = 'Ya existe un empleado con ese correo.';
      if (Object.keys(fe).length) { setErrors(fe); document.getElementById(`emp-${Object.keys(fe)[0]}`)?.focus(); }
    };
    const onSettled = () => { submitting.current = false; };
    if (employee) {
      // Solo se mandan los campos que cambiaron (cambiar el rol cierra la sesión del empleado)
      const diff = Object.fromEntries(Object.entries(input).filter(([k, v]) => v !== (employee as unknown as Record<string, string>)[k]));
      if (Object.keys(diff).length === 0) { submitting.current = false; onClose(); return; }
      update.mutate({ id: employee.id, input: diff }, { onSuccess: (u) => onClose({ updated: u }), onError, onSettled });
    } else {
      create.mutate(input, { onSuccess: (r) => onClose({ created: r }), onError, onSettled });
    }
  };

  const err = create.error ?? update.error;
  const general = err && !Object.keys(errors).length ? describeEmployeeError(err) : null;
  const field = (k: 'name' | 'email', label: string, type: string, auto: string) => (
    <div>
      <label htmlFor={`emp-${k}`} className="block text-sm font-medium text-espresso mb-1">{label} *</label>
      <input id={`emp-${k}`} type={type} autoComplete={auto} value={form[k]} maxLength={k === 'name' ? 100 : 200}
        onChange={(e) => { setForm((f) => ({ ...f, [k]: e.target.value })); setErrors((x) => ({ ...x, [k]: undefined })); }}
        aria-invalid={!!errors[k]} aria-describedby={errors[k] ? `emp-${k}-error` : undefined} className={errCls(!!errors[k])} />
      {errors[k] && <p id={`emp-${k}-error`} className="mt-1 text-sm text-red-700">{errors[k]}</p>}
    </div>
  );

  return (
    <Overlay>
      <div ref={ref} role="dialog" aria-modal="true" aria-labelledby="emp-form-title" tabIndex={-1} className={panel}>
        <h2 id="emp-form-title" className="text-lg font-bold text-espresso">{employee ? 'Editar empleado' : 'Nuevo empleado'}</h2>
        <form onSubmit={submit} noValidate className="flex flex-col gap-4">
          {field('name', 'Nombre', 'text', 'off')}
          {field('email', 'Correo', 'email', 'off')}
          <div>
            <label htmlFor="emp-role" className="block text-sm font-medium text-espresso mb-1">Rol *</label>
            <select id="emp-role" value={form.role} disabled={isSelf}
              onChange={(e) => setForm((f) => ({ ...f, role: e.target.value as EmployeeRole }))}
              aria-describedby={isSelf ? 'emp-role-self' : employee ? 'emp-role-hint' : undefined} className={inputBase}>
              {ROLE_OPTIONS.map((r) => <option key={r.value} value={r.value}>{r.label}</option>)}
            </select>
            {isSelf
              ? <p id="emp-role-self" className="mt-1 text-xs text-espresso/70">No puedes cambiar tu propio rol.</p>
              : employee && <p id="emp-role-hint" className="mt-1 text-xs text-espresso/70">Si cambias el rol, su sesión se cerrará y deberá volver a entrar.</p>}
          </div>
          {!employee && <p className="text-xs text-espresso/70">Se generará una contraseña temporal que verás una sola vez.</p>}
          {general && <p role="alert" className="text-sm text-red-700 bg-red-50 rounded-lg px-3 py-2">{general}</p>}
          <div className="flex flex-col-reverse sm:flex-row gap-2 sm:justify-end">
            <button type="button" onClick={() => onClose()} disabled={pending} className={btnSecondary}>Cancelar</button>
            <button type="submit" disabled={pending} className={btnPrimary}>
              {pending && <Loader2 size={16} className="animate-spin" aria-hidden="true" />}
              {pending ? 'Guardando...' : employee ? 'Guardar cambios' : 'Crear empleado'}
            </button>
          </div>
        </form>
      </div>
    </Overlay>
  );
}

// ── Contraseña temporal (se muestra una sola vez) ────────────
export function TempPasswordDialog({ result, reason, onClose }: { result: TempPasswordResult; reason: 'created' | 'reset'; onClose: () => void }) {
  const ref = useDialog<HTMLDivElement>(onClose);
  const [copied, setCopied] = useState<'ok' | 'fail' | null>(null);
  const copy = async () => {
    try { await navigator.clipboard.writeText(result.temporaryPassword); setCopied('ok'); }
    catch { setCopied('fail'); }
  };
  return (
    <Overlay>
      <div ref={ref} role="dialog" aria-modal="true" aria-labelledby="tmp-title" aria-describedby="tmp-desc" tabIndex={-1} className={panel}>
        <h2 id="tmp-title" className="text-lg font-bold text-espresso">
          {reason === 'created' ? 'Empleado creado' : 'Contraseña restablecida'}
        </h2>
        <p id="tmp-desc" className="text-sm text-espresso">
          Contraseña temporal de <strong>{result.employee.name}</strong> ({result.employee.email}). Solo se muestra esta vez.
        </p>
        <div className="flex items-stretch gap-2">
          <label htmlFor="tmp-value" className="sr-only">Contraseña temporal</label>
          <input id="tmp-value" readOnly value={result.temporaryPassword} autoComplete="off" spellCheck={false}
            onFocus={(e) => e.currentTarget.select()} className={`${inputBase} font-mono text-base tracking-wider`} />
          <button type="button" onClick={copy} className={btnSecondary}>
            {copied === 'ok' ? <Check size={16} aria-hidden="true" /> : <Copy size={16} aria-hidden="true" />} Copiar
          </button>
        </div>
        <p aria-live="polite" className="text-sm text-espresso min-h-5">
          {copied === 'ok' ? 'Contraseña copiada al portapapeles.' : copied === 'fail' ? 'No se pudo copiar: selecciónala y cópiala a mano.' : ''}
        </p>
        <p className="flex gap-2 text-sm text-amber-900 bg-amber-50 border border-amber-700/30 rounded-lg px-3 py-2">
          <ShieldAlert size={16} className="shrink-0 mt-0.5" aria-hidden="true" />
          <span>Compártela por un canal seguro (en persona o por mensaje directo). Al ingresar, el sistema le pedirá cambiarla.</span>
        </p>
        <button type="button" onClick={onClose} className={btnPrimary}>Listo, ya la compartí</button>
      </div>
    </Overlay>
  );
}

// ── Confirmación (alertdialog) ───────────────────────────────
export function ConfirmDialog({ title, description, confirmLabel, pendingLabel, danger, pending, error, onConfirm, onClose }: {
  title: string; description: string; confirmLabel: string; pendingLabel: string; danger?: boolean;
  pending: boolean; error: string | null; onConfirm: () => void; onClose: () => void;
}) {
  const ref = useDialog<HTMLDivElement>(() => { if (!pending) onClose(); });
  return (
    <Overlay>
      <div ref={ref} role="alertdialog" aria-modal="true" aria-labelledby="cf-title" aria-describedby="cf-desc" tabIndex={-1} className={panel}>
        <h2 id="cf-title" className="text-lg font-bold text-espresso">{title}</h2>
        <p id="cf-desc" className="text-sm text-espresso/70">{description}</p>
        {error && <p role="alert" className="text-sm text-red-700 bg-red-50 rounded-lg px-3 py-2">{error}</p>}
        <div className="flex flex-col-reverse sm:flex-row gap-2 sm:justify-end">
          <button type="button" onClick={onClose} disabled={pending} className={btnSecondary}>Volver</button>
          <button type="button" onClick={onConfirm} disabled={pending} className={danger ? btnDanger : btnPrimary}>
            {pending && <Loader2 size={16} className="animate-spin" aria-hidden="true" />}
            {pending ? pendingLabel : confirmLabel}
          </button>
        </div>
      </div>
    </Overlay>
  );
}

// ── Registrar nómina ─────────────────────────────────────────
const MONEY_RE = /^\d+(\.\d{1,2})?$/;
export function PayrollDialog({ employee, onClose }: { employee: Employee; onClose: (saved: boolean) => void }) {
  const pay = usePayroll();
  const submitting = useRef(false);
  const [form, setForm] = useState({ amount: '', date: todayInMazatlan(), notes: '', paidFromCash: false });
  const [errors, setErrors] = useState<Partial<Record<'amount' | 'date' | 'notes', string>>>({});
  const ref = useDialog<HTMLDivElement>(() => { if (!pay.isPending) onClose(false); });

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (pay.isPending || submitting.current) return;
    const found: typeof errors = {};
    const a = form.amount.trim();
    if (!MONEY_RE.test(a) || Number(a) <= 0) found.amount = 'Monto mayor a 0 con hasta 2 decimales.';
    if (!form.date) found.date = 'Indica la fecha.';
    else if (form.date > todayInMazatlan()) found.date = 'La fecha no puede ser futura.';
    if (form.notes.trim().length > 500) found.notes = 'Máximo 500 caracteres.';
    setErrors(found);
    const first = Object.keys(found)[0];
    if (first) { document.getElementById(`pay-${first}`)?.focus(); return; }
    submitting.current = true;
    pay.mutate({ id: employee.id, input: { amount: a, date: form.date, notes: form.notes.trim() || undefined, paidFromCash: form.paidFromCash } }, {
      onSuccess: () => onClose(true),
      onError: (err) => { const fe = fieldErrorsFrom(err) as typeof errors; if (Object.keys(fe).length) setErrors(fe); },
      onSettled: () => { submitting.current = false; },
    });
  };
  const input = (k: 'amount' | 'date' | 'notes', label: string, props: React.InputHTMLAttributes<HTMLInputElement>) => (
    <div>
      <label htmlFor={`pay-${k}`} className="block text-sm font-medium text-espresso mb-1">{label}</label>
      <input id={`pay-${k}`} value={form[k]} onChange={(e) => { setForm((f) => ({ ...f, [k]: e.target.value })); setErrors((x) => ({ ...x, [k]: undefined })); }}
        aria-invalid={!!errors[k]} aria-describedby={errors[k] ? `pay-${k}-error` : undefined} className={errCls(!!errors[k])} {...props} />
      {errors[k] && <p id={`pay-${k}-error`} className="mt-1 text-sm text-red-700">{errors[k]}</p>}
    </div>
  );
  return (
    <Overlay>
      <div ref={ref} role="dialog" aria-modal="true" aria-labelledby="pay-title" tabIndex={-1} className={panel}>
        <h2 id="pay-title" className="text-lg font-bold text-espresso">Registrar nómina · {employee.name}</h2>
        <form onSubmit={submit} noValidate className="flex flex-col gap-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {input('amount', 'Monto (MXN) *', { inputMode: 'decimal', autoComplete: 'off', placeholder: '0.00' })}
            {input('date', 'Fecha *', { type: 'date', max: todayInMazatlan() })}
          </div>
          {input('notes', 'Notas (opcional)', { maxLength: 520, autoComplete: 'off', placeholder: 'Ej. Quincena 1–15' })}
          <div className="flex items-start gap-3">
            <input id="pay-cash" type="checkbox" checked={form.paidFromCash} onChange={(e) => setForm((f) => ({ ...f, paidFromCash: e.target.checked }))}
              aria-describedby="pay-cash-hint" className="mt-0.5 h-6 w-6 shrink-0 accent-caramel-dark focus:outline-none focus-visible:ring-2 focus-visible:ring-caramel-dark" />
            <div>
              <label htmlFor="pay-cash" className="text-sm font-medium text-espresso">Pagado de caja</label>
              <p id="pay-cash-hint" className="text-xs text-espresso/70">Se resta del efectivo esperado del turno abierto.</p>
            </div>
          </div>
          <p className="text-xs text-espresso/70">Se registra como gasto de nómina: aparece en Gastos y baja la utilidad.</p>
          {pay.error && !Object.keys(errors).length && <p role="alert" className="text-sm text-red-700 bg-red-50 rounded-lg px-3 py-2">{describeEmployeeError(pay.error)}</p>}
          <div className="flex flex-col-reverse sm:flex-row gap-2 sm:justify-end">
            <button type="button" onClick={() => onClose(false)} disabled={pay.isPending} className={btnSecondary}>Cancelar</button>
            <button type="submit" disabled={pay.isPending} className={btnPrimary}>
              {pay.isPending && <Loader2 size={16} className="animate-spin" aria-hidden="true" />}
              {pay.isPending ? 'Guardando...' : 'Registrar nómina'}
            </button>
          </div>
        </form>
      </div>
    </Overlay>
  );
}
