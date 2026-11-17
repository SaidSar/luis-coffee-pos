import { ChefHat, HandPlatter, Banknote, Ban, Loader2 } from 'lucide-react';
import type { Order } from '../../types/pos';
import type { Role } from '../../types';
import {
  orderStatusMeta, btnOutlineDanger, btnDark, btnPrimary, canTakeOrders, canCharge, isActiveOrder,
} from './posUi';

interface Props {
  order:          Order;
  role:           Role | undefined;
  statusPending:  boolean;
  statusError:    string | null;
  onAdvance:      (status: 'IN_KITCHEN' | 'SERVED') => void;
  onPay:          () => void;
  onCancel:       () => void;
}

export default function OrderStatusBar({ order, role, statusPending, statusError, onAdvance, onPay, onCancel }: Props) {
  const meta   = orderStatusMeta[order.status];
  const Icon   = meta.icon;
  const active = isActiveOrder(order.status);
  const staff  = canTakeOrders(role);

  return (
    <div className="rounded-xl border border-espresso/20 p-3 flex flex-col gap-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-espresso">
          <span className="font-bold">Ticket #{order.ticketNumber}</span>
          {order.customerName && <span> · {order.customerName}</span>}
        </p>
        <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold ${meta.className}`}>
          <Icon size={14} aria-hidden="true" />
          {meta.label}
        </span>
      </div>

      {active && (
        <div className="flex flex-wrap gap-2">
          {staff && order.status === 'OPEN' && (
            <button type="button" onClick={() => onAdvance('IN_KITCHEN')} disabled={statusPending} className={btnDark}>
              {statusPending ? <Loader2 size={16} className="animate-spin" aria-hidden="true" /> : <ChefHat size={16} aria-hidden="true" />}
              Enviar a cocina
            </button>
          )}
          {staff && order.status === 'IN_KITCHEN' && (
            <button type="button" onClick={() => onAdvance('SERVED')} disabled={statusPending} className={btnDark}>
              {statusPending ? <Loader2 size={16} className="animate-spin" aria-hidden="true" /> : <HandPlatter size={16} aria-hidden="true" />}
              Marcar servida
            </button>
          )}
          {canCharge(role) && (
            <>
              <button type="button" onClick={onPay} disabled={statusPending} className={btnPrimary}>
                <Banknote size={16} aria-hidden="true" />
                Cobrar
              </button>
              <button type="button" onClick={onCancel} disabled={statusPending} className={btnOutlineDanger}>
                <Ban size={16} aria-hidden="true" />
                Cancelar orden
              </button>
            </>
          )}
        </div>
      )}

      {statusError && <p role="alert" className="text-sm text-red-700 bg-red-50 rounded-lg px-3 py-2">{statusError}</p>}
    </div>
  );
}
