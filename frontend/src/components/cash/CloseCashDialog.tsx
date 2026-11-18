import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { Loader2, Lock, TriangleAlert } from 'lucide-react';
import { useDialog } from '../../hooks/useDialog';
import { useCloseCash } from '../../hooks/useCash';
import { describeApiError, fieldErrorsFrom } from '../../lib/apiError';
import { formatMXN } from '../../types';
import type { CashCloseResult } from '../../types/cash';
import { btnPrimary, btnDark, btnSecondary, inputBase, focusRing } from '../pos/posUi';
import { cashAmountError } from './cashUi';
import CashResultSummary from './CashResultSummary';

interface Props {
  pendingOrders: number;
  expectedCash?: string; // solo ADMIN lo ve antes de contar
  onClose: (result: CashCloseResult | null) => void;
}

type Field = 'countedCash' | 'notes';
const MAX_NOTES = 500;

export default function CloseCashDialog({ pendingOrders, expectedCash, onClose }: Props) {
  const close = useCloseCash();
  const [counted, setCounted] = useState('');
  const [notes,   setNotes]   = useState('');
  const [errors,  setErrors]  = useState<Partial<Record<Field, string>>>({});
  const [result,  setResult]  = useState<CashCloseResult | null>(null);
  const submitting = useRef(false);

  const dialogRef = useDialog<HTMLDivElement>(() => { if (!close.isPending) onClose(result); });

  // El formulario desaparece al mostrar el resultado: el foco pasa al resumen
  useEffect(() => {
    if (result) document.getElementById('close-cash-result-title')?.focus();
  }, [result]);

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (close.isPending || submitting.current || result) return;
    const found: Partial<Record<Field, string>> = {};
    const amountErr = cashAmountError(counted, 'El efectivo contado');
    if (amountErr) found.countedCash = amountErr;
    if (notes.trim().length > MAX_NOTES) found.notes = `Máximo ${MAX_NOTES} caracteres.`;
    setErrors(found);
    const first = (Object.keys(found) as Field[])[0];
    if (first) { document.getElementById(`close-cash-${first}`)?.focus(); return; }

    submitting.current = true;
    close.mutate({ countedCash: counted.trim(), notes: notes.trim() || undefined }, {
      onSuccess: (r) => setResult(r),
      onError: (err) => {
        const fe = fieldErrorsFrom(err) as Partial<Record<Field, string>>;
        if (Object.keys(fe).length) setErrors(fe);
      },
      onSettled: () => { submitting.current = false; },
    });
  };

  const fieldErrs = close.error ? fieldErrorsFrom(close.error) : {};
  const serverError = close.error && !Object.keys(fieldErrs).length ? describeApiError(close.error, 'cash').message : null;
  const describedBy = (f: Field, hint?: string) => [errors[f] ? `close-cash-${f}-error` : '', hint ?? ''].filter(Boolean).join(' ') || undefined;

  return (
    <div className="fixed inset-0 bg-espresso/50 z-50 flex items-center justify-center p-4">
      <div ref={dialogRef} role="dialog" aria-modal="true" aria-labelledby="close-cash-title" tabIndex={-1}
        className="bg-white rounded-2xl w-full max-w-md max-h-[90vh] overflow-y-auto p-6 focus:outline-none">
        <h2 id="close-cash-title" className="text-lg font-bold text-espresso mb-4">{result ? 'Caja cerrada' : 'Cerrar caja'}</h2>

        {result ? (
          <div className="flex flex-col gap-4">
            <p role="status" className="sr-only">Caja cerrada. Resultado: {result.result === 'EVEN' ? 'cuadrado' : result.result === 'OVER' ? 'sobrante' : 'faltante'}.</p>
            <CashResultSummary data={result} headingId="close-cash-result-title" />
            <button type="button" onClick={() => onClose(result)} className={btnPrimary}>Listo</button>
          </div>
        ) : (
          <form onSubmit={submit} noValidate className="flex flex-col gap-4">
            {pendingOrders > 0 && (
              <p className="flex gap-2 text-sm text-amber-900 bg-amber-50 border border-amber-700/30 rounded-lg px-3 py-2">
                <TriangleAlert size={16} className="shrink-0 mt-0.5" aria-hidden="true" />
                <span>
                  Hay {pendingOrders} {pendingOrders === 1 ? 'orden' : 'órdenes'} sin cobrar. Puedes cerrar de todos modos;
                  sus cobros contarán en el siguiente turno.{' '}
                  <Link to="/pos" onClick={() => onClose(null)} className={`underline font-semibold rounded ${focusRing}`}>Ir al punto de venta</Link>
                </span>
              </p>
            )}
            {expectedCash !== undefined && (
              <p className="text-sm text-espresso">Efectivo esperado: <strong>{formatMXN(expectedCash)}</strong></p>
            )}
            <div>
              <label htmlFor="close-cash-countedCash" className="block text-sm font-medium text-espresso mb-1">Efectivo contado (MXN) *</label>
              <input id="close-cash-countedCash" inputMode="decimal" autoComplete="off" value={counted} placeholder="0.00"
                onChange={(e) => { setCounted(e.target.value); setErrors((x) => ({ ...x, countedCash: undefined })); }}
                aria-invalid={!!errors.countedCash} aria-describedby={describedBy('countedCash', 'close-cash-countedCash-hint')}
                className={`${inputBase} ${errors.countedCash ? 'border-red-700' : ''}`} />
              <p id="close-cash-countedCash-hint" className="mt-1 text-xs text-espresso/70">Cuenta billetes y monedas de la caja, incluido el fondo.</p>
              {errors.countedCash && <p id="close-cash-countedCash-error" className="mt-1 text-sm text-red-700">{errors.countedCash}</p>}
            </div>
            <div>
              <label htmlFor="close-cash-notes" className="block text-sm font-medium text-espresso mb-1">Notas (opcional)</label>
              <textarea id="close-cash-notes" rows={3} value={notes}
                onChange={(e) => { setNotes(e.target.value); setErrors((x) => ({ ...x, notes: undefined })); }}
                aria-invalid={!!errors.notes} aria-describedby={describedBy('notes', 'close-cash-notes-hint')}
                className={`${inputBase} py-2 resize-none ${errors.notes ? 'border-red-700' : ''}`} />
              <p id="close-cash-notes-hint" className="mt-1 text-xs text-espresso/70">{notes.length}/{MAX_NOTES} caracteres</p>
              {errors.notes && <p id="close-cash-notes-error" className="mt-1 text-sm text-red-700">{errors.notes}</p>}
            </div>
            {serverError && <p role="alert" className="text-sm text-red-700 bg-red-50 rounded-lg px-3 py-2">{serverError}</p>}
            <div className="flex flex-col-reverse sm:flex-row gap-2 sm:justify-end">
              <button type="button" onClick={() => onClose(null)} disabled={close.isPending} className={btnSecondary}>Cancelar</button>
              <button type="submit" disabled={close.isPending} className={btnDark}>
                {close.isPending ? <Loader2 size={16} className="animate-spin" aria-hidden="true" /> : <Lock size={16} aria-hidden="true" />}
                {close.isPending ? 'Cerrando...' : 'Cerrar caja'}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
