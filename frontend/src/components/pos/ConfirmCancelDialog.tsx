import { Loader2 } from 'lucide-react';
import { useDialog } from '../../hooks/useDialog';
import { btnSecondary, btnDanger } from './posUi';

interface Props {
  ticketNumber: number;
  pending:      boolean;
  error:        string | null;
  onConfirm:    () => void;
  onClose:      () => void;
}

export default function ConfirmCancelDialog({ ticketNumber, pending, error, onConfirm, onClose }: Props) {
  // Escape cierra (salvo mientras se procesa, para no perder el resultado)
  const dialogRef = useDialog<HTMLDivElement>(() => { if (!pending) onClose(); });

  return (
    <div className="fixed inset-0 bg-espresso/50 z-50 flex items-center justify-center p-4">
      <div
        ref={dialogRef}
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="cancel-title"
        aria-describedby="cancel-desc"
        tabIndex={-1}
        className="bg-white rounded-2xl w-full max-w-sm p-6 flex flex-col gap-4 focus:outline-none"
      >
        <h2 id="cancel-title" className="text-lg font-bold text-espresso">¿Cancelar el ticket #{ticketNumber}?</h2>
        <p id="cancel-desc" className="text-sm text-espresso/70">
          La orden quedará cancelada y la mesa se liberará. Esta acción no se puede deshacer.
        </p>
        {error && <p role="alert" className="text-sm text-red-700 bg-red-50 rounded-lg px-3 py-2">{error}</p>}
        <div className="flex flex-col-reverse sm:flex-row gap-2 sm:justify-end">
          <button type="button" onClick={onClose} disabled={pending} className={btnSecondary}>Volver</button>
          <button type="button" onClick={onConfirm} disabled={pending} className={btnDanger}>
            {pending && <Loader2 size={16} className="animate-spin" aria-hidden="true" />}
            {pending ? 'Cancelando...' : 'Sí, cancelar orden'}
          </button>
        </div>
      </div>
    </div>
  );
}
