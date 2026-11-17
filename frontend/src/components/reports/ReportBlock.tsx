import type { ReactNode } from 'react';
import { Loader2 } from 'lucide-react';
import { describeApiError } from '../../lib/apiError';
import { card, focusRing } from './reportUi';

interface Props {
  title:     string;
  titleId:   string;
  isLoading: boolean;
  error:     unknown;
  isEmpty:   boolean;
  emptyText?: string;
  onRetry:   () => void;
  actions?:  ReactNode;
  children:  ReactNode;
}

// Contenedor con estados de carga, error (role="alert") y vacío para cada bloque del reporte
export default function ReportBlock({
  title, titleId, isLoading, error, isEmpty, emptyText = 'Sin ventas en este periodo', onRetry, actions, children,
}: Props) {
  return (
    <section aria-labelledby={titleId} className={`${card} flex flex-col gap-3 min-w-0`}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 id={titleId} className="text-base font-bold text-espresso">{title}</h2>
        {actions}
      </div>

      {isLoading ? (
        <p role="status" className="flex items-center gap-2 text-sm text-espresso/70 py-4">
          <Loader2 size={16} className="motion-safe:animate-spin" aria-hidden="true" /> Cargando...
        </p>
      ) : error ? (
        <div role="alert" className="flex flex-wrap items-center gap-3 text-sm text-red-700 bg-red-50 rounded-lg px-3 py-2">
          {describeApiError(error, 'report').message}
          <button
            type="button"
            onClick={onRetry}
            className={`min-h-11 px-4 rounded-xl border border-espresso/50 bg-white text-espresso text-sm font-semibold hover:bg-cream ${focusRing}`}
          >
            Reintentar
          </button>
        </div>
      ) : isEmpty ? (
        <p className="text-sm text-espresso/70 py-4">{emptyText}</p>
      ) : (
        children
      )}
    </section>
  );
}
