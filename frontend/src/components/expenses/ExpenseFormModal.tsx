import { useRef, useState } from 'react';
import { X, Loader2 } from 'lucide-react';
import { useDialog } from '../../hooks/useDialog';
import { useCreateExpense, useUpdateExpense } from '../../hooks/useExpenses';
import { describeApiError, fieldErrorsFrom } from '../../lib/apiError';
import { todayInMazatlan } from '../../lib/mazatlanDates';
import { EXPENSE_CATEGORIES, EXPENSE_CATEGORY_LABEL, type ExpenseCategory } from '../../constants/expenseCategories';
import type { Expense, ExpenseInput } from '../../types/expenses';
import { focusRing } from '../reports/reportUi';

interface Props {
  expense?: Expense | null;               // null/undefined = nuevo gasto
  onClose:  (saved?: 'created' | 'updated') => void;
}

type Field = keyof ExpenseInput;
const MONEY_RE = /^\d+(\.\d{1,2})?$/;
const MAX_AMOUNT = 1_000_000;

const addDays = (ymd: string, days: number) => {
  const [y, m, d] = ymd.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d + days)).toISOString().slice(0, 10);
};

// Mismas reglas que el backend (el servidor sigue siendo la autoridad)
const validate = (f: ExpenseInput): Partial<Record<Field, string>> => {
  const e: Partial<Record<Field, string>> = {};
  const desc = f.description.trim();
  if (!desc) e.description = 'La descripción es obligatoria.';
  else if (desc.length > 200) e.description = 'Máximo 200 caracteres.';
  const amt = f.amount.trim();
  if (!amt) e.amount = 'Indica el monto.';
  else if (!MONEY_RE.test(amt)) e.amount = 'Usa solo números con hasta 2 decimales (ej. 1250.50).';
  else if (Number(amt) <= 0) e.amount = 'El monto debe ser mayor a 0.';
  else if (Number(amt) > MAX_AMOUNT) e.amount = 'El monto máximo es $1,000,000.';
  if (!f.date) e.date = 'Indica la fecha.';
  else if (f.date > addDays(todayInMazatlan(), 1)) e.date = 'La fecha no puede ser futura.';
  if (f.notes.trim().length > 500) e.notes = 'Máximo 500 caracteres.';
  return e;
};

const inputCls = (invalid: boolean) =>
  `w-full min-h-11 px-3 rounded-xl border bg-white text-espresso text-sm placeholder:text-espresso/70
   focus:outline-none focus:ring-2 focus:ring-caramel-dark ${invalid ? 'border-red-700' : 'border-espresso/50'}`;

export default function ExpenseFormModal({ expense, onClose }: Props) {
  const isEdit = !!expense;
  const create = useCreateExpense();
  const update = useUpdateExpense();
  const pending = create.isPending || update.isPending;
  // Bandera síncrona contra doble envío: `pending` solo cambia en el siguiente render,
  // así que dos envíos en el mismo instante (doble clic, Enter repetido) lo verían en false
  const submitting = useRef(false);

  const [form, setForm] = useState<ExpenseInput>({
    description: expense?.description ?? '',
    amount:      expense ? String(expense.amount) : '',
    category:    expense?.category ?? 'INSUMOS',
    date:        expense?.date ?? todayInMazatlan(),
    notes:       expense?.notes ?? '',
  });
  const [errors, setErrors] = useState<Partial<Record<Field, string>>>({});

  // Escape no cierra mientras se guarda (evita perder el resultado)
  const dialogRef = useDialog<HTMLDivElement>(() => { if (!pending) onClose(); });

  const set = (k: Field) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
    setForm((f) => ({ ...f, [k]: e.target.value }));
    if (errors[k]) setErrors((x) => ({ ...x, [k]: undefined }));
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (pending || submitting.current) return; // sin doble envío
    const found = validate(form);
    setErrors(found);
    const first = (Object.keys(found) as Field[])[0];
    if (first) {
      document.getElementById(`expense-${first}`)?.focus();
      return;
    }
    const input: ExpenseInput = { ...form, description: form.description.trim(), amount: form.amount.trim(), notes: form.notes.trim() };
    const onError = (err: unknown) => {
      const fe = fieldErrorsFrom(err) as Partial<Record<Field, string>>;
      if (Object.keys(fe).length) setErrors(fe);
    };
    const onSettled = () => { submitting.current = false; };
    submitting.current = true;
    if (isEdit) update.mutate({ id: expense!.id, input }, { onSuccess: () => onClose('updated'), onError, onSettled });
    else create.mutate(input, { onSuccess: () => onClose('created'), onError, onSettled });
  };

  const serverError = create.error || update.error;
  const describedBy = (k: Field, hint?: string) => [errors[k] ? `expense-${k}-error` : '', hint ?? ''].filter(Boolean).join(' ') || undefined;
  const fieldError = (k: Field) => errors[k] && (
    <p id={`expense-${k}-error`} className="mt-1 text-sm text-red-700">{errors[k]}</p>
  );

  return (
    <div className="fixed inset-0 bg-espresso/50 z-50 flex items-center justify-center p-4">
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="expense-modal-title"
        tabIndex={-1}
        className="bg-white rounded-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto focus:outline-none"
      >
        <div className="flex items-center justify-between px-6 py-4 border-b border-caramel/10 sticky top-0 bg-white rounded-t-2xl">
          <h2 id="expense-modal-title" className="font-bold text-espresso text-lg">{isEdit ? 'Editar gasto' : 'Nuevo gasto'}</h2>
          <button
            type="button"
            onClick={() => onClose()}
            disabled={pending}
            aria-label="Cerrar"
            className={`min-h-11 min-w-11 flex items-center justify-center rounded-xl text-espresso/70 hover:text-espresso ${focusRing}`}
          >
            <X size={20} aria-hidden="true" />
          </button>
        </div>

        <form onSubmit={handleSubmit} noValidate className="p-6 flex flex-col gap-4">
          <div>
            <label htmlFor="expense-description" className="block text-sm font-medium text-espresso mb-1">Descripción *</label>
            <input id="expense-description" value={form.description} onChange={set('description')} maxLength={250}
              aria-invalid={!!errors.description} aria-describedby={describedBy('description')}
              placeholder="Ej. Café en grano" className={inputCls(!!errors.description)} />
            {fieldError('description')}
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label htmlFor="expense-amount" className="block text-sm font-medium text-espresso mb-1">Monto (MXN) *</label>
              <input id="expense-amount" inputMode="decimal" autoComplete="off" value={form.amount} onChange={set('amount')}
                aria-invalid={!!errors.amount} aria-describedby={describedBy('amount')}
                placeholder="0.00" className={inputCls(!!errors.amount)} />
              {fieldError('amount')}
            </div>
            <div>
              <label htmlFor="expense-date" className="block text-sm font-medium text-espresso mb-1">Fecha *</label>
              <input id="expense-date" type="date" value={form.date} onChange={set('date')}
                aria-invalid={!!errors.date} aria-describedby={describedBy('date')} className={inputCls(!!errors.date)} />
              {fieldError('date')}
            </div>
          </div>

          <div>
            <label htmlFor="expense-category" className="block text-sm font-medium text-espresso mb-1">Categoría *</label>
            <select id="expense-category" value={form.category}
              onChange={(e) => setForm((f) => ({ ...f, category: e.target.value as ExpenseCategory }))}
              aria-invalid={!!errors.category} aria-describedby={describedBy('category')} className={inputCls(!!errors.category)}>
              {EXPENSE_CATEGORIES.map((c) => <option key={c} value={c}>{EXPENSE_CATEGORY_LABEL[c]}</option>)}
            </select>
            {fieldError('category')}
          </div>

          <div>
            <label htmlFor="expense-notes" className="block text-sm font-medium text-espresso mb-1">Notas (opcional)</label>
            <textarea id="expense-notes" value={form.notes} onChange={set('notes')} rows={3}
              aria-invalid={!!errors.notes} aria-describedby={describedBy('notes', 'expense-notes-hint')}
              className={`${inputCls(!!errors.notes)} py-2 resize-none`} />
            <p id="expense-notes-hint" className="mt-1 text-xs text-espresso/70">{form.notes.length}/500 caracteres</p>
            {fieldError('notes')}
          </div>

          {serverError && (
            <p role="alert" className="text-sm text-red-700 bg-red-50 rounded-lg px-3 py-2">
              {describeApiError(serverError, 'expense').message}
            </p>
          )}

          <div className="flex flex-col-reverse sm:flex-row gap-2">
            <button type="button" onClick={() => onClose()} disabled={pending}
              className={`flex-1 min-h-11 rounded-xl border border-espresso/50 bg-white text-espresso text-sm font-semibold hover:bg-cream disabled:opacity-60 ${focusRing}`}>
              Cancelar
            </button>
            <button type="submit" disabled={pending}
              className={`flex-1 min-h-11 inline-flex items-center justify-center gap-2 rounded-xl bg-caramel-dark hover:bg-espresso text-white text-sm font-semibold disabled:opacity-60 disabled:cursor-not-allowed ${focusRing}`}>
              {pending && <Loader2 size={16} className="motion-safe:animate-spin" aria-hidden="true" />}
              {pending ? 'Guardando...' : isEdit ? 'Guardar cambios' : 'Registrar gasto'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
