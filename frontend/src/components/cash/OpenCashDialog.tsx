import { useRef, useState } from 'react';
import { Loader2, LockOpen } from 'lucide-react';
import { useDialog } from '../../hooks/useDialog';
import { useOpenCash } from '../../hooks/useCash';
import { describeApiError, fieldErrorsFrom } from '../../lib/apiError';
import { btnPrimary, btnSecondary, inputBase } from '../pos/posUi';
import { cashAmountError } from './cashUi';

interface Props { onClose: (opened: boolean) => void }

export default function OpenCashDialog({ onClose }: Props) {
  const open = useOpenCash();
  const [amount, setAmount] = useState('');
  const [error, setError]   = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  // Bandera síncrona contra doble envío
  const submitting = useRef(false);

  const dialogRef = useDialog<HTMLDivElement>(() => { if (!open.isPending) onClose(false); });

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (open.isPending || submitting.current) return;
    const found = cashAmountError(amount, 'El fondo inicial');
    setError(found);
    if (found) { inputRef.current?.focus(); return; }
    submitting.current = true;
    open.mutate(amount.trim(), {
      onSuccess: () => onClose(true),
      onError:   (err) => {
        const fe = fieldErrorsFrom(err).openingFloat;
        if (fe) { setError(fe); inputRef.current?.focus(); }
      },
      onSettled: () => { submitting.current = false; },
    });
  };

  const serverError = open.error && !fieldErrorsFrom(open.error).openingFloat ? describeApiError(open.error, 'cash').message : null;

  return (
    <div className="fixed inset-0 bg-espresso/50 z-50 flex items-center justify-center p-4">
      <div ref={dialogRef} role="dialog" aria-modal="true" aria-labelledby="open-cash-title" aria-describedby="open-cash-desc"
        tabIndex={-1} className="bg-white rounded-2xl w-full max-w-sm p-6 focus:outline-none">
        <form onSubmit={submit} noValidate className="flex flex-col gap-4">
          <h2 id="open-cash-title" className="text-lg font-bold text-espresso">Abrir caja</h2>
          <p id="open-cash-desc" className="text-sm text-espresso/70">Cuenta el efectivo con el que inicia el turno.</p>
          <div>
            <label htmlFor="open-cash-float" className="block text-sm font-medium text-espresso mb-1">Fondo inicial (MXN) *</label>
            <input ref={inputRef} id="open-cash-float" inputMode="decimal" autoComplete="off" value={amount} placeholder="0.00"
              onChange={(e) => { setAmount(e.target.value); setError(null); }}
              aria-invalid={!!error} aria-describedby={error ? 'open-cash-float-error' : undefined}
              className={`${inputBase} ${error ? 'border-red-700' : ''}`} />
            {error && <p id="open-cash-float-error" className="mt-1 text-sm text-red-700">{error}</p>}
          </div>
          {serverError && <p role="alert" className="text-sm text-red-700 bg-red-50 rounded-lg px-3 py-2">{serverError}</p>}
          <div className="flex flex-col-reverse sm:flex-row gap-2 sm:justify-end">
            <button type="button" onClick={() => onClose(false)} disabled={open.isPending} className={btnSecondary}>Cancelar</button>
            <button type="submit" disabled={open.isPending} className={btnPrimary}>
              {open.isPending ? <Loader2 size={16} className="animate-spin" aria-hidden="true" /> : <LockOpen size={16} aria-hidden="true" />}
              {open.isPending ? 'Abriendo...' : 'Abrir caja'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
