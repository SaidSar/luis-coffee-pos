import { ShoppingBag, Loader2 } from 'lucide-react';
import type { Order, Table } from '../../types/pos';
import { describeApiError } from '../../lib/apiError';
import { tableStatusMeta, orderStatusMeta, focusRing, btnSecondary } from './posUi';

interface Props {
  tables:          Table[] | undefined;
  isLoading:       boolean;
  error:           unknown;
  onRetry:         () => void;
  selectedTableId: string | null;
  takeoutSelected: boolean;
  takeoutOrders:   Order[];
  currentOrderId:  string | null;
  onSelectTable:   (table: Table) => void;
  onNewTakeout:    () => void;
  onSelectOrder:   (order: Order) => void;
}

export default function TableGrid({
  tables, isLoading, error, onRetry, selectedTableId, takeoutSelected,
  takeoutOrders, currentOrderId, onSelectTable, onNewTakeout, onSelectOrder,
}: Props) {
  return (
    <section aria-labelledby="pos-tables-title" className="bg-white rounded-2xl border border-caramel/10 p-4">
      <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
        <h2 id="pos-tables-title" className="text-sm font-semibold text-espresso">Mesas</h2>
        <button
          type="button"
          onClick={onNewTakeout}
          aria-pressed={takeoutSelected && !currentOrderId}
          className={`${btnSecondary} ${takeoutSelected && !currentOrderId ? 'ring-2 ring-caramel-dark' : ''}`}
        >
          <ShoppingBag size={16} aria-hidden="true" />
          Para llevar
        </button>
      </div>

      {isLoading && (
        <p className="flex items-center gap-2 text-sm text-espresso/70 py-4" role="status">
          <Loader2 size={16} className="animate-spin" aria-hidden="true" /> Cargando mesas...
        </p>
      )}

      {!!error && !isLoading && (
        <div role="alert" className="flex flex-wrap items-center gap-3 text-sm text-red-700 bg-red-50 rounded-lg px-3 py-2">
          {describeApiError(error, 'load').message}
          <button type="button" onClick={onRetry} className={btnSecondary}>Reintentar</button>
        </div>
      )}

      {!isLoading && !error && tables?.length === 0 && (
        <p className="text-sm text-espresso/70 py-4">No hay mesas registradas. Un administrador puede crearlas.</p>
      )}

      {!!tables?.length && (
        <ul className="grid grid-cols-3 sm:grid-cols-4 xl:grid-cols-4 gap-2">
          {tables.map((t) => {
            const meta     = tableStatusMeta[t.status];
            const Icon     = meta.icon;
            const selected = selectedTableId === t.id;
            const ticket   = t.activeOrder ? `, ticket ${t.activeOrder.ticketNumber}` : '';
            return (
              <li key={t.id}>
                <button
                  type="button"
                  onClick={() => onSelectTable(t)}
                  aria-pressed={selected}
                  aria-label={`Mesa ${t.number}, ${meta.label}${ticket}`}
                  className={`
                    w-full min-h-16 rounded-xl border-2 px-2 py-2 flex flex-col items-center justify-center gap-0.5
                    transition-colors ${meta.className} ${focusRing}
                    ${selected ? 'ring-2 ring-caramel-dark ring-offset-2' : ''}
                  `}
                >
                  <span className="text-lg font-bold leading-none">{t.number}</span>
                  <span className="flex items-center gap-1 text-xs font-medium">
                    <Icon size={12} aria-hidden="true" />
                    {meta.label}
                  </span>
                  {t.activeOrder && <span className="text-[11px] font-medium">#{t.activeOrder.ticketNumber}</span>}
                </button>
              </li>
            );
          })}
        </ul>
      )}

      {takeoutOrders.length > 0 && (
        <div className="mt-4">
          <h3 className="text-xs font-semibold text-espresso/70 uppercase tracking-wide mb-2">Para llevar activas</h3>
          <ul className="flex flex-wrap gap-2">
            {takeoutOrders.map((o) => {
              const meta = orderStatusMeta[o.status];
              const Icon = meta.icon;
              return (
                <li key={o.id}>
                  <button
                    type="button"
                    onClick={() => onSelectOrder(o)}
                    aria-pressed={currentOrderId === o.id}
                    className={`${btnSecondary} ${currentOrderId === o.id ? 'ring-2 ring-caramel-dark' : ''}`}
                  >
                    <ShoppingBag size={14} aria-hidden="true" />
                    #{o.ticketNumber}{o.customerName ? ` · ${o.customerName}` : ''}
                    <span className="flex items-center gap-1 text-xs font-medium">
                      <Icon size={12} aria-hidden="true" /> {meta.label}
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </section>
  );
}
