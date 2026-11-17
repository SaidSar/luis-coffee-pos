import { Loader2 } from 'lucide-react';
import { useDialog } from '../../hooks/useDialog';
import { describeApiError } from '../../lib/apiError';
import type { Expense } from '../../types/expenses';
import { formatMoney, focusRing } from '../reports/reportUi';

interface Props {
  expense:   Expense;
  pending:   boolean;
  error:     unknown;
  onConfirm: () => void;
  onClose:   () => void;
}

export default function ConfirmDeleteExpense({ expense, pending, error, onConfirm, onClose }: Props) {
  const dialogRef = useDialog<HTMLDivElement>(() => { if (!pending) onClose(); });

  return (
    <div className="fixed inset-0 bg-espresso/50 z-50 flex items-center justify-center p-4">
      <div
        ref={dialogRef}
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="delete-expense-title"
        aria-describedby="delete-expense-desc"
        tabIndex={-1}
        className="bg-white rounded-2xl w-full max-w-sm p-6 flex flex-col gap-4 focus:outline-none"
      >
        <h2 id="delete-expense-title" className="text-lg font-bold text-espresso">¿Eliminar este gasto?</h2>
        <p id="delete-expense-desc" className="text-sm text-espresso">
          Se eliminará <strong>"{expense.description}"</strong> por <strong>{formatMoney(expense.amount)}</strong>.
          Esta acción no se puede deshacer.
        </p>
        {!!error && <p role="alert" className="text-sm text-red-700 bg-red-50 rounded-lg px-3 py-2">{describeApiError(error, 'expense').message}</p>}
        <div className="flex flex-col-reverse sm:flex-row gap-2 sm:justify-end">
          <button type="button" onClick={onClose} disabled={pending}
            className={`min-h-11 px-4 rounded-xl border border-espresso/50 bg-white text-espresso text-sm font-semibold hover:bg-cream disabled:opacity-60 ${focusRing}`}>
            Volver
          </button>
          <button type="button" onClick={onConfirm} disabled={pending}
            className={`min-h-11 px-4 inline-flex items-center justify-center gap-2 rounded-xl bg-red-700 hover:bg-red-800 text-white text-sm font-semibold disabled:opacity-60 ${focusRing}`}>
            {pending && <Loader2 size={16} className="motion-safe:animate-spin" aria-hidden="true" />}
            {pending ? 'Eliminando...' : 'Sí, eliminar'}
          </button>
        </div>
      </div>
    </div>
  );
}
