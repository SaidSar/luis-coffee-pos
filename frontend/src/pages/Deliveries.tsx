import { useEffect, useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { Clock, Bike, CircleCheckBig, CircleDollarSign, CircleAlert, Phone, Loader2, type LucideIcon } from 'lucide-react';
import { useAuthStore } from '../stores/authStore';
import { usePeriod } from '../hooks/usePeriod';
import { useDeliveries, useSendDelivery, useDeliverDelivery } from '../hooks/useDeliveries';
import { useOrder, useCancelOrder } from '../hooks/usePos';
import { describeApiError } from '../lib/apiError';
import { REPORT_TZ } from '../lib/mazatlanDates';
import type { DeliveryCard, DeliveryStatus } from '../types/pos';
import { formatMXN } from '../types';
import PeriodSelector from '../components/reports/PeriodSelector';
import SendDeliveryDialog from '../components/deliveries/SendDeliveryDialog';
import PaymentModal from '../components/pos/PaymentModal';
import ConfirmCancelDialog from '../components/pos/ConfirmCancelDialog';
import { btnPrimary, btnSecondary, btnOutlineDanger, canCharge, focusRing } from '../components/pos/posUi';
import { card } from '../components/reports/reportUi';

type BoardStatus = Exclude<DeliveryStatus, 'CANCELLED'>;

const COLUMNS: { status: BoardStatus; title: string; empty: string; icon: LucideIcon }[] = [
  { status: 'PENDING',    title: 'Pendientes', empty: 'Sin entregas pendientes', icon: Clock },
  { status: 'IN_TRANSIT', title: 'En camino',  empty: 'Ninguna entrega en camino', icon: Bike },
  { status: 'DELIVERED',  title: 'Entregadas', empty: 'Aún no hay entregas realizadas', icon: CircleCheckBig },
];

const STATUS_META: Record<BoardStatus, { label: string; icon: LucideIcon; className: string }> = {
  PENDING:    { label: 'Pendiente',  icon: Clock,          className: 'bg-amber-50 text-amber-900 border-amber-700/40' },
  IN_TRANSIT: { label: 'En camino',  icon: Bike,           className: 'bg-sky-50 text-sky-900 border-sky-700/40' },
  DELIVERED:  { label: 'Entregada',  icon: CircleCheckBig, className: 'bg-green-50 text-green-900 border-green-700/40' },
};

const timeFmt = new Intl.DateTimeFormat('es-MX', { timeZone: REPORT_TZ, hour: '2-digit', minute: '2-digit' });
const formatTime = (iso: string) => timeFmt.format(new Date(iso));
// Teléfono de 10 dígitos legible: 669 123 4567
const prettyPhone = (p: string) => (/^\d{10}$/.test(p) ? `${p.slice(0, 3)} ${p.slice(3, 6)} ${p.slice(6)}` : p);

// Foco pendiente tras una acción que mueve la tarjeta de columna o la quita del tablero
type FocusTarget = { id: string; ready: (d: DeliveryCard | undefined) => boolean; fallback?: string };

export default function Deliveries() {
  const role = useAuthStore((s) => s.user?.role);
  const qc   = useQueryClient();
  const { preset, range, selectPreset, selectCustom } = usePeriod('today');

  const list    = useDeliveries(range);
  const send    = useSendDelivery();
  const deliver = useDeliverDelivery();
  const cancel  = useCancelOrder();

  const [sending,    setSending]    = useState<DeliveryCard | null>(null);
  const [cancelling, setCancelling] = useState<DeliveryCard | null>(null);
  const [payingId,   setPayingId]   = useState<string | null>(null); // orderId
  const [actionError, setActionError] = useState<{ id: string; message: string } | null>(null);
  const [announcement, setAnnouncement] = useState('');
  const payingOrder = useOrder(payingId);

  // Banderas síncronas contra doble clic (isPending cambia en el siguiente render)
  const busy = useRef(false);

  const announce = (msg: string) => setAnnouncement((prev) => (prev === msg ? `${msg} ` : msg));
  const invalidateDeliveries = () => qc.invalidateQueries({ queryKey: ['deliveries'] });

  const items = list.data?.items;

  // Mueve el foco a la tarjeta cuando ya aparece en su nueva columna (o al encabezado si salió del tablero)
  const focusTarget = useRef<FocusTarget | null>(null);
  const dialogOpen = !!sending || !!cancelling || !!payingId;
  useEffect(() => {
    const t = focusTarget.current;
    if (!t || dialogOpen) return;
    const d = items?.find((x) => x.id === t.id);
    if (!t.ready(d)) return;
    focusTarget.current = null;
    const el = document.getElementById(d && d.status !== 'CANCELLED' ? `delivery-card-${d.id}` : t.fallback ?? 'deliveries-board-title');
    el?.focus();
  }, [items, dialogOpen]);

  // ── Acciones ──
  const confirmSend = (driverName: string) => {
    if (!sending || busy.current) return;
    busy.current = true;
    const d = sending;
    send.mutate({ id: d.id, driverName }, {
      onSuccess: () => {
        focusTarget.current = { id: d.id, ready: (x) => x?.status === 'IN_TRANSIT' };
        setSending(null);
        announce(`Ticket ${d.order.ticketNumber} en camino con ${driverName}`);
      },
      onSettled: () => { busy.current = false; },
    });
  };

  const markDelivered = (d: DeliveryCard) => {
    if (busy.current) return;
    busy.current = true;
    setActionError(null);
    deliver.mutate(d.id, {
      onSuccess: () => {
        focusTarget.current = { id: d.id, ready: (x) => x?.status === 'DELIVERED' };
        announce(`Ticket ${d.order.ticketNumber} entregado`);
      },
      onError: (err) => setActionError({ id: d.id, message: describeApiError(err, 'status').message }),
      onSettled: () => { busy.current = false; },
    });
  };

  const confirmCancel = () => {
    if (!cancelling || busy.current) return;
    busy.current = true;
    const d = cancelling;
    cancel.mutate(d.order.id, {
      onSuccess: () => {
        focusTarget.current = { id: d.id, ready: (x) => !x || x.status === 'CANCELLED', fallback: `deliveries-col-${d.status}` };
        setCancelling(null);
        invalidateDeliveries();
        announce(`Ticket ${d.order.ticketNumber} cancelado`);
      },
      onSettled: () => { busy.current = false; },
    });
  };

  const closePayment = (paid: boolean) => {
    const id = items?.find((x) => x.order.id === payingId)?.id;
    setPayingId(null);
    if (paid && id) {
      focusTarget.current = { id, ready: (x) => !!x?.order.paid };
      invalidateDeliveries();
      announce('Cobro completado');
    }
  };

  const columns = COLUMNS.map((c) => ({ ...c, cards: (items ?? []).filter((d) => d.status === c.status) }));
  const cancelledCount = (items ?? []).filter((d) => d.status === 'CANCELLED').length;
  const mayCharge = canCharge(role);

  return (
    <div className="flex flex-col gap-4 min-w-0">
      <p className="sr-only" role="status" aria-live="polite">{announcement}</p>

      <section aria-labelledby="deliveries-period-title" className={`${card} flex flex-col gap-3`}>
        <h2 id="deliveries-period-title" className="text-base font-bold text-espresso">Día</h2>
        <PeriodSelector
          key={`${range.from}_${range.to}`}
          value={range}
          preset={preset}
          onPreset={selectPreset}
          onCustom={selectCustom}
          label="Periodo de entregas"
          idPrefix="deliveries"
        />
      </section>

      <section aria-labelledby="deliveries-board-title" className="flex flex-col gap-3">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 id="deliveries-board-title" tabIndex={-1} className="text-base font-bold text-espresso focus:outline-none">Tablero de entregas</h2>
          {cancelledCount > 0 && (
            <p className="text-sm text-espresso/70">
              {cancelledCount} {cancelledCount === 1 ? 'entrega cancelada' : 'entregas canceladas'} en el periodo
            </p>
          )}
        </div>

        {list.isLoading && (
          <p role="status" className={`${card} flex items-center gap-2 text-sm text-espresso/70`}>
            <Loader2 size={16} className="animate-spin" aria-hidden="true" /> Cargando entregas...
          </p>
        )}

        {list.error && !list.isLoading && (
          <div role="alert" className="flex flex-wrap items-center gap-3 text-sm text-red-700 bg-red-50 rounded-lg px-3 py-2">
            {describeApiError(list.error, 'load').message}
            <button type="button" onClick={() => list.refetch()} className={btnSecondary}>Reintentar</button>
          </div>
        )}

        {items && (
          <div className="grid gap-4 lg:grid-cols-3">
            {columns.map((col) => {
              const ColIcon = col.icon;
              return (
                <section key={col.status} aria-labelledby={`deliveries-col-${col.status}`} className={`${card} flex flex-col gap-3 min-w-0`}>
                  <h3
                    id={`deliveries-col-${col.status}`}
                    tabIndex={-1}
                    className="flex items-center gap-2 text-sm font-semibold text-espresso focus:outline-none focus-visible:ring-2 focus-visible:ring-caramel-dark rounded"
                  >
                    <ColIcon size={16} aria-hidden="true" />
                    {col.title} <span className="font-normal text-espresso/70">({col.cards.length})</span>
                  </h3>
                  {col.cards.length === 0 ? (
                    <p className="text-sm text-espresso/70">{col.empty}</p>
                  ) : (
                    <ul className="flex flex-col gap-3">
                      {col.cards.map((d) => (
                        <li key={d.id}>
                          <DeliveryCardView
                            d={d}
                            mayCharge={mayCharge}
                            busy={send.isPending || deliver.isPending || cancel.isPending}
                            delivering={deliver.isPending && deliver.variables === d.id}
                            loadingPayment={payingId === d.order.id && payingOrder.isLoading}
                            error={actionError?.id === d.id ? actionError.message : null}
                            onSend={() => { send.reset(); setActionError(null); setSending(d); }}
                            onDeliver={() => markDelivered(d)}
                            onPay={() => { setActionError(null); setPayingId(d.order.id); }}
                            onCancel={() => { cancel.reset(); setActionError(null); setCancelling(d); }}
                          />
                        </li>
                      ))}
                    </ul>
                  )}
                </section>
              );
            })}
          </div>
        )}
      </section>

      {sending && (
        <SendDeliveryDialog
          ticketNumber={sending.order.ticketNumber}
          initialDriver={sending.driverName ?? ''}
          pending={send.isPending}
          error={send.error}
          onConfirm={confirmSend}
          onClose={() => setSending(null)}
        />
      )}

      {payingId && payingOrder.data && <PaymentModal order={payingOrder.data} onClose={closePayment} />}
      {payingId && payingOrder.error && (
        <p role="alert" className="text-sm text-red-700 bg-red-50 rounded-lg px-3 py-2">
          {describeApiError(payingOrder.error, 'load').message}
          <button type="button" onClick={() => setPayingId(null)} className={`${btnSecondary} ml-3`}>Cerrar</button>
        </p>
      )}

      {cancelling && (
        <ConfirmCancelDialog
          ticketNumber={cancelling.order.ticketNumber}
          pending={cancel.isPending}
          error={cancel.error ? describeApiError(cancel.error, 'cancel').message : null}
          onConfirm={confirmCancel}
          onClose={() => setCancelling(null)}
          description="La orden y su entrega quedarán canceladas. Esta acción no se puede deshacer."
        />
      )}
    </div>
  );
}

interface CardProps {
  d: DeliveryCard;
  mayCharge: boolean;
  busy: boolean;
  delivering: boolean;
  loadingPayment: boolean;
  error: string | null;
  onSend: () => void;
  onDeliver: () => void;
  onPay: () => void;
  onCancel: () => void;
}

function DeliveryCardView({ d, mayCharge, busy, delivering, loadingPayment, error, onSend, onDeliver, onPay, onCancel }: CardProps) {
  const status = d.status as BoardStatus;
  const meta = STATUS_META[status];
  const StatusIcon = meta.icon;
  const titleId = `delivery-card-${d.id}-title`;
  const paid = d.order.paid;
  const t = d.order.ticketNumber;

  return (
    <article
      id={`delivery-card-${d.id}`}
      tabIndex={-1}
      aria-labelledby={titleId}
      className={`rounded-xl border border-espresso/20 p-3 flex flex-col gap-2 text-sm text-espresso ${focusRing}`}
    >
      <div className="flex flex-wrap items-start justify-between gap-2">
        <h4 id={titleId} className="font-bold">
          Ticket #{t}{d.order.customerName ? ` · ${d.order.customerName}` : ''}
        </h4>
        <span className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-medium ${meta.className}`}>
          <StatusIcon size={12} aria-hidden="true" /> {meta.label}
        </span>
      </div>

      <span className={`self-start inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-semibold ${
        paid ? 'bg-green-50 text-green-900 border-green-700/40' : 'bg-red-50 text-red-800 border-red-700/40'}`}>
        {paid ? <CircleDollarSign size={12} aria-hidden="true" /> : <CircleAlert size={12} aria-hidden="true" />}
        {paid ? 'Pagada' : 'Pendiente de cobro'}
      </span>

      <dl className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-3 gap-y-1">
        <dt className="text-espresso/70">Dirección</dt>
        <dd className="break-words">
          {d.address}
          {d.reference && <span className="block text-xs text-espresso/70">Ref.: {d.reference}</span>}
        </dd>
        <dt className="text-espresso/70">Teléfono</dt>
        <dd>
          <a href={`tel:${d.phone}`} className={`inline-flex items-center gap-1 min-h-11 underline text-caramel-dark hover:text-espresso rounded ${focusRing}`}>
            <Phone size={14} aria-hidden="true" /> {prettyPhone(d.phone)}
            <span className="sr-only">, llamar a {d.order.customerName ?? 'cliente'}</span>
          </a>
        </dd>
        <dt className="text-espresso/70">Repartidor</dt>
        <dd>{d.driverName ?? 'Sin asignar'}</dd>
        <dt className="text-espresso/70">Hora</dt>
        <dd>
          {formatTime(d.createdAt)}
          {d.inTransitAt && <> · salió {formatTime(d.inTransitAt)}</>}
          {d.deliveredAt && <> · entregada {formatTime(d.deliveredAt)}</>}
        </dd>
        <dt className="text-espresso/70">Total</dt>
        <dd className="font-semibold">
          {formatMXN(d.order.total)}
          <span className="block text-xs font-normal text-espresso/70">Incluye envío de {formatMXN(d.deliveryFee)}</span>
        </dd>
      </dl>

      {d.order.items.length > 0 && (
        <p className="text-xs text-espresso/70">{d.order.items.map((i) => `${i.quantity} × ${i.name}`).join(', ')}</p>
      )}

      {error && <p role="alert" className="text-sm text-red-700 bg-red-50 rounded-lg px-3 py-2">{error}</p>}

      <div className="flex flex-wrap gap-2">
        {status === 'PENDING' && (
          <button type="button" onClick={onSend} disabled={busy} aria-label={`Enviar ticket ${t}`} className={btnPrimary}>
            <Bike size={16} aria-hidden="true" /> Enviar
          </button>
        )}
        {status === 'IN_TRANSIT' && (
          <button type="button" onClick={onDeliver} disabled={busy} aria-label={`Marcar ticket ${t} como entregado`} className={btnPrimary}>
            {delivering ? <Loader2 size={16} className="animate-spin" aria-hidden="true" /> : <CircleCheckBig size={16} aria-hidden="true" />}
            {delivering ? 'Guardando...' : 'Marcar entregada'}
          </button>
        )}
        {mayCharge && !paid && (
          <button type="button" onClick={onPay} disabled={busy || loadingPayment} aria-label={`Cobrar ticket ${t}`} className={btnSecondary}>
            {loadingPayment ? <Loader2 size={16} className="animate-spin" aria-hidden="true" /> : <CircleDollarSign size={16} aria-hidden="true" />}
            Cobrar
          </button>
        )}
        {mayCharge && !paid && status !== 'DELIVERED' && (
          <button type="button" onClick={onCancel} disabled={busy} aria-label={`Cancelar ticket ${t}`} className={btnOutlineDanger}>
            Cancelar
          </button>
        )}
      </div>
    </article>
  );
}
