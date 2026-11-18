import { useRef, useState } from 'react';
import { Loader2, Bike } from 'lucide-react';
import { useDialog } from '../../hooks/useDialog';
import { describeApiError, fieldErrorsFrom } from '../../lib/apiError';
import { btnPrimary, btnSecondary, inputBase } from '../pos/posUi';

interface Props {
  ticketNumber: number;
  initialDriver: string;
  pending:   boolean;
  error:     unknown;
  onConfirm: (driverName: string) => void;
  onClose:   () => void;
}

const MAX = 80; // mismo tope que el servidor

// Asigna repartidor y pasa la entrega a "En camino"
export default function SendDeliveryDialog({ ticketNumber, initialDriver, pending, error, onConfirm, onClose }: Props) {
  const dialogRef = useDialog<HTMLDivElement>(() => { if (!pending) onClose(); });
  const inputRef  = useRef<HTMLInputElement>(null);
  const [driver, setDriver] = useState(initialDriver);
  const [localError, setLocalError] = useState<string | null>(null);

  const serverField = fieldErrorsFrom(error).driverName;
  const fieldError  = localError ?? serverField ?? null;
  const generalError = error && !serverField ? describeApiError(error, 'status').message : null;

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (pending) return;
    const name = driver.trim();
    if (!name) { setLocalError('Indica quién lleva la entrega.'); inputRef.current?.focus(); return; }
    if (name.length > MAX) { setLocalError(`Máximo ${MAX} caracteres.`); inputRef.current?.focus(); return; }
    setLocalError(null);
    onConfirm(name);
  };

  return (
    <div className="fixed inset-0 bg-espresso/50 z-50 flex items-center justify-center p-4">
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="send-delivery-title"
        tabIndex={-1}
        className="bg-white rounded-2xl w-full max-w-sm p-6 focus:outline-none"
      >
        <form onSubmit={submit} noValidate className="flex flex-col gap-4">
          <h2 id="send-delivery-title" className="text-lg font-bold text-espresso">Enviar ticket #{ticketNumber}</h2>
          <div>
            <label htmlFor="send-delivery-driver" className="block text-sm font-medium text-espresso mb-1">Repartidor *</label>
            <input
              ref={inputRef}
              id="send-delivery-driver"
              value={driver}
              onChange={(e) => { setDriver(e.target.value); setLocalError(null); }}
              maxLength={MAX + 20}
              autoComplete="off"
              aria-invalid={!!fieldError}
              aria-describedby={fieldError ? 'send-delivery-driver-error' : undefined}
              className={`${inputBase} ${fieldError ? 'border-red-700' : ''}`}
            />
            {fieldError && <p id="send-delivery-driver-error" className="mt-1 text-sm text-red-700">{fieldError}</p>}
          </div>
          {generalError && <p role="alert" className="text-sm text-red-700 bg-red-50 rounded-lg px-3 py-2">{generalError}</p>}
          <div className="flex flex-col-reverse sm:flex-row gap-2 sm:justify-end">
            <button type="button" onClick={onClose} disabled={pending} className={btnSecondary}>Volver</button>
            <button type="submit" disabled={pending} className={btnPrimary}>
              {pending ? <Loader2 size={16} className="animate-spin" aria-hidden="true" /> : <Bike size={16} aria-hidden="true" />}
              {pending ? 'Enviando...' : 'Marcar en camino'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
