import { useState, type ReactNode } from 'react';
import { Plus, Minus, Send, Loader2, ChevronUp, ChevronDown, Receipt } from 'lucide-react';
import { usePosDraftStore, selectDraftTotal, selectDraftCount } from '../../stores/posDraftStore';
import type { Order } from '../../types/pos';
import type { ApiErrorInfo } from '../../lib/apiError';
import { formatMXN } from '../../types';
import { useMediaQuery, LG_QUERY } from '../../hooks/useMediaQuery';
import { btnPrimary, focusRing, inputBase, toCents, centsToMXN, paymentMethodLabel } from './posUi';
import DeliveryForm from './DeliveryForm';
import type { DeliveryErrors, DeliveryField } from './deliveryValidation';

interface Props {
  contextLabel: string | null;      // "Mesa 3", "Para llevar" o null si no hay nada seleccionado
  order:        Order | undefined;  // orden activa ya enviada (si existe)
  orderLoading: boolean;
  orderError:   string | null;
  canEdit:      boolean;            // rol con permiso y orden aún activa
  sending:      boolean;
  sendError:    ApiErrorInfo | null;
  onSend:       () => void;
  statusBar:    ReactNode;          // barra de estado / acciones de la orden
  deliveryErrors:        DeliveryErrors;
  onDeliveryFieldChange: (f: DeliveryField) => void;
}

export default function TicketPanel({
  contextLabel, order, orderLoading, orderError, canEdit, sending, sendError, onSend, statusBar,
  deliveryErrors, onDeliveryFieldChange,
}: Props) {
  const items           = usePosDraftStore((s) => s.items);
  const orderType       = usePosDraftStore((s) => s.orderType);
  const customerName    = usePosDraftStore((s) => s.customerName);
  const setQuantity     = usePosDraftStore((s) => s.setQuantity);
  const setNotes        = usePosDraftStore((s) => s.setNotes);
  const setCustomerName = usePosDraftStore((s) => s.setCustomerName);
  const draftTotal      = usePosDraftStore(selectDraftTotal);
  const draftCount      = usePosDraftStore(selectDraftCount);

  // Panel inferior colapsable en móvil (en lg siempre visible)
  const [open, setOpen] = useState(false);
  // En lg el detalle tiene su propio scroll: solo ahí es una región enfocable con teclado
  const isLg = useMediaQuery(LG_QUERY);

  const deliveryFeeDraft = usePosDraftStore((s) => s.delivery.deliveryFee);

  const orderCents = order ? toCents(order.total) : 0;
  const showCustomerField = orderType === 'TAKEOUT' && !order;
  const showDeliveryForm  = orderType === 'DELIVERY' && !order;
  // Cargo de envío del borrador (estimado; el oficial lo devuelve el servidor en order.total)
  const feeDraftCents = showDeliveryForm && /^\d+(\.\d{1,2})?$/.test(deliveryFeeDraft.trim()) ? toCents(deliveryFeeDraft.trim()) : 0;
  const draftCents = Math.round(draftTotal * 100) + (draftTotal > 0 ? feeDraftCents : 0);

  return (
    <aside
      aria-labelledby="pos-ticket-title"
      className={`
        fixed inset-x-0 bottom-0 z-20 flex flex-col max-h-[85dvh] bg-white border-t border-espresso/20
        rounded-t-2xl shadow-[0_-4px_16px_rgba(44,24,16,0.12)]
        transition-[translate] duration-300
        ${open ? 'translate-y-0' : 'translate-y-[calc(100%-4rem)]'}
        lg:static lg:z-auto lg:max-h-none lg:h-full lg:min-h-0 lg:translate-y-0 lg:rounded-2xl lg:border lg:border-caramel/10 lg:shadow-none
      `}
    >
      {/* Barra de apertura (solo móvil) */}
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-controls="pos-ticket-body"
        className={`lg:hidden flex items-center justify-between gap-3 h-16 px-4 shrink-0 ${focusRing}`}
      >
        <span className="flex items-center gap-2 font-semibold text-espresso">
          <Receipt size={18} aria-hidden="true" />
          Ticket{contextLabel ? ` · ${contextLabel}` : ''}
        </span>
        <span className="flex items-center gap-2 text-sm text-espresso">
          {draftCount > 0 && <span>{draftCount} por enviar</span>}
          <span className="font-bold">{centsToMXN(orderCents + draftCents)}</span>
          {open ? <ChevronDown size={18} aria-hidden="true" /> : <ChevronUp size={18} aria-hidden="true" />}
          <span className="sr-only">{open ? 'Ocultar ticket' : 'Mostrar ticket'}</span>
        </span>
      </button>

      <div
        id="pos-ticket-body"
        className={`
          flex flex-col gap-3 overflow-y-auto overscroll-contain px-4 pb-4 lg:pt-4
          lg:flex-1 lg:min-h-0 lg:overflow-hidden lg:pb-0
          transition-[visibility] duration-300 ${open ? 'visible' : 'invisible'} lg:visible
        `}
      >
        <h2 id="pos-ticket-title" className="text-base font-bold text-espresso">
          {contextLabel ? `Ticket · ${contextLabel}` : 'Ticket'}
        </h2>

        {!contextLabel && (
          <p className="text-sm text-espresso/70">Selecciona una mesa, "Para llevar" o "A domicilio" para empezar.</p>
        )}

        {/* Detalle: en lg se desplaza solo; encabezado y pie quedan fijos */}
        <div
          role={isLg ? 'region' : undefined}
          aria-label={isLg ? 'Detalle del ticket' : undefined}
          tabIndex={isLg ? 0 : undefined}
          className={`flex flex-col gap-3 lg:flex-1 lg:min-h-0 lg:overflow-y-auto lg:overscroll-contain lg:-mx-1 lg:px-1 lg:pb-2 rounded-lg ${focusRing}`}
        >
        {orderLoading && (
          <p role="status" className="flex items-center gap-2 text-sm text-espresso/70">
            <Loader2 size={16} className="animate-spin" aria-hidden="true" /> Cargando orden...
          </p>
        )}
        {orderError && <p role="alert" className="text-sm text-red-700 bg-red-50 rounded-lg px-3 py-2">{orderError}</p>}

        {/* Productos ya enviados (los dicta el servidor) */}
        {order && order.items.length > 0 && (
          <div>
            <h3 className="text-xs font-semibold text-espresso/70 uppercase tracking-wide mb-1">Enviado</h3>
            <ul className="divide-y divide-espresso/10">
              {order.items.map((i) => (
                <li key={i.id} className="py-2 flex justify-between gap-2 text-sm text-espresso">
                  <span>
                    {i.quantity} × {i.product.name}
                    {i.notes && <span className="block text-xs text-espresso/70">Nota: {i.notes}</span>}
                    {i.paidQuantity > 0 && (
                      <span className="block text-xs font-medium text-green-800">{i.paidQuantity} de {i.quantity} cobrada{i.paidQuantity === 1 ? '' : 's'}</span>
                    )}
                  </span>
                  <span className="font-medium">{formatMXN(i.lineTotal)}</span>
                </li>
              ))}
            </ul>
          </div>
        )}

        {order && order.splits.length > 0 && (
          <div>
            <h3 className="text-xs font-semibold text-espresso/70 uppercase tracking-wide mb-1">Cuentas cobradas</h3>
            <ul className="text-sm text-espresso divide-y divide-espresso/10">
              {order.splits.map((s) => (
                <li key={s.id} className="py-1.5">
                  Cuenta {s.number}{s.label ? ` (${s.label})` : ''} · {formatMXN(s.amount)} · {[...new Set(s.payments.map((p) => paymentMethodLabel[p.method]))].join(' + ')}
                </li>
              ))}
            </ul>
          </div>
        )}

        {showCustomerField && (
          <div>
            <label htmlFor="pos-customer" className="block text-sm font-medium text-espresso mb-1">
              Nombre del cliente (opcional)
            </label>
            <input
              id="pos-customer"
              value={customerName ?? ''}
              onChange={(e) => setCustomerName(e.target.value)}
              maxLength={80}
              autoComplete="off"
              placeholder="Ej. Ana"
              className={inputBase}
            />
          </div>
        )}

        {showDeliveryForm && <DeliveryForm errors={deliveryErrors} onFieldChange={onDeliveryFieldChange} />}

        {order?.delivery && (
          <p className="text-sm text-espresso">
            <span className="font-semibold">Entrega:</span> {order.delivery.address}
            {order.delivery.reference && <span className="block text-xs text-espresso/70">Ref.: {order.delivery.reference}</span>}
          </p>
        )}

        {/* Borrador: nueva orden o nueva ronda */}
        {contextLabel && (
          <div>
            <h3 className="text-xs font-semibold text-espresso/70 uppercase tracking-wide mb-1">
              {order ? 'Nueva ronda' : 'Por enviar'}
            </h3>
            {items.length === 0 ? (
              <p className="text-sm text-espresso/70 py-2">
                {canEdit ? 'Toca un producto del catálogo para agregarlo.' : 'Esta orden ya no admite productos.'}
              </p>
            ) : (
              <ul className="divide-y divide-espresso/10">
                {items.map((i) => (
                  <li key={i.productId} className="py-2 flex flex-col gap-2">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-sm font-medium text-espresso">{i.name}</span>
                      <span className="text-sm text-espresso">{centsToMXN(Math.round(i.unitPrice * 100) * i.quantity)}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => setQuantity(i.productId, i.quantity - 1)}
                        aria-label={`Quitar uno de ${i.name}`}
                        className={`min-h-11 min-w-11 rounded-xl border border-espresso/50 text-espresso flex items-center justify-center hover:bg-cream ${focusRing}`}
                      >
                        <Minus size={16} aria-hidden="true" />
                      </button>
                      <span className="min-w-8 text-center font-semibold text-espresso" aria-label={`Cantidad de ${i.name}: ${i.quantity}`}>
                        {i.quantity}
                      </span>
                      <button
                        type="button"
                        onClick={() => setQuantity(i.productId, i.quantity + 1)}
                        aria-label={`Agregar uno de ${i.name}`}
                        className={`min-h-11 min-w-11 rounded-xl border border-espresso/50 text-espresso flex items-center justify-center hover:bg-cream ${focusRing}`}
                      >
                        <Plus size={16} aria-hidden="true" />
                      </button>
                      <label htmlFor={`note-${i.productId}`} className="sr-only">Nota para {i.name}</label>
                      <input
                        id={`note-${i.productId}`}
                        value={i.notes ?? ''}
                        onChange={(e) => setNotes(i.productId, e.target.value)}
                        maxLength={200}
                        placeholder="Nota (opcional)"
                        className={`${inputBase} flex-1`}
                      />
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}

        </div>

        {/* Pie fijo: total y acciones siempre visibles */}
        <div className="flex flex-col gap-3 lg:shrink-0 lg:border-t lg:border-espresso/20 lg:py-3">
        {/* Totales: el oficial es el del servidor; el borrador es estimado */}
        {contextLabel && (
          <dl className="border-t border-espresso/20 pt-3 lg:border-t-0 lg:pt-0 text-sm text-espresso space-y-1">
            {order?.delivery && (
              <>
                <div className="flex justify-between"><dt>Productos</dt><dd>{formatMXN(order.itemsTotal)}</dd></div>
                <div className="flex justify-between"><dt>Cargo de envío</dt><dd>{formatMXN(order.delivery.deliveryFee)}</dd></div>
              </>
            )}
            {order && (
              <div className="flex justify-between">
                <dt>Total de la orden</dt><dd className="font-semibold">{formatMXN(order.total)}</dd>
              </div>
            )}
            {order && order.splits.length > 0 && !order.paid && (
              <>
                <div className="flex justify-between"><dt>Cobrado</dt><dd>{formatMXN(order.paidAmount)}</dd></div>
                <div className="flex justify-between font-semibold"><dt>Pendiente por cobrar</dt><dd>{formatMXN(order.balance)}</dd></div>
              </>
            )}
            {showDeliveryForm && draftTotal > 0 && (
              <>
                <div className="flex justify-between"><dt>Productos (estimado)</dt><dd>{centsToMXN(Math.round(draftTotal * 100))}</dd></div>
                <div className="flex justify-between"><dt>Cargo de envío</dt><dd>{centsToMXN(feeDraftCents)}</dd></div>
              </>
            )}
            {draftCents > 0 && (
              <div className="flex justify-between">
                <dt>{order ? 'Nueva ronda (estimado)' : 'Total estimado'}</dt><dd>{centsToMXN(draftCents)}</dd>
              </div>
            )}
            <div className="flex justify-between text-base font-bold">
              <dt>Total</dt><dd>{centsToMXN(orderCents + draftCents)}</dd>
            </div>
          </dl>
        )}

        {sendError && (
          <div role="alert" className="text-sm text-red-700 bg-red-50 rounded-lg px-3 py-2">
            <p>{sendError.message}</p>
            {sendError.products.length > 0 && (
              <ul className="list-disc pl-5 mt-1">{sendError.products.map((n) => <li key={n}>{n}</li>)}</ul>
            )}
          </div>
        )}

        {contextLabel && canEdit && (
          <button
            type="button"
            onClick={onSend}
            disabled={items.length === 0 || sending}
            className={`${btnPrimary} w-full`}
          >
            {sending ? <Loader2 size={16} className="animate-spin" aria-hidden="true" /> : <Send size={16} aria-hidden="true" />}
            {sending ? 'Enviando...' : 'Enviar a cocina'}
          </button>
        )}

        {statusBar}
        </div>
      </div>
    </aside>
  );
}
