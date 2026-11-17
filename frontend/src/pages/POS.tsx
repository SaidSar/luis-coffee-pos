import { useMemo, useState } from 'react';
import { Lock } from 'lucide-react';
import { useAuthStore } from '../stores/authStore';
import { usePosDraftStore, selectDraftTotal } from '../stores/posDraftStore';
import {
  useTables, useOrders, useOrder, useCreateOrder, useAddItems, useUpdateOrderStatus, useCancelOrder,
} from '../hooks/usePos';
import { describeApiError } from '../lib/apiError';
import type { Order, Table } from '../types/pos';
import type { Product } from '../types';
import { toNum } from '../types';
import TableGrid from '../components/pos/TableGrid';
import ProductPicker from '../components/pos/ProductPicker';
import TicketPanel from '../components/pos/TicketPanel';
import OrderStatusBar from '../components/pos/OrderStatusBar';
import PaymentModal from '../components/pos/PaymentModal';
import ConfirmCancelDialog from '../components/pos/ConfirmCancelDialog';
import { canTakeOrders, isActiveOrder, centsToMXN } from '../components/pos/posUi';

const ACTIVE = ['OPEN', 'IN_KITCHEN', 'SERVED'] as const;
const NBSP   = String.fromCharCode(160); // fuerza a re-anunciar un mensaje idéntico

export default function POS() {
  const role = useAuthStore((s) => s.user?.role);

  // ── Borrador (memoria) ──
  const tableId         = usePosDraftStore((s) => s.tableId);
  const orderType       = usePosDraftStore((s) => s.orderType);
  const items           = usePosDraftStore((s) => s.items);
  const customerName    = usePosDraftStore((s) => s.customerName);
  const setTable        = usePosDraftStore((s) => s.setTable);
  const setOrderType    = usePosDraftStore((s) => s.setOrderType);
  const addItem         = usePosDraftStore((s) => s.addItem);
  const clearDraft      = usePosDraftStore((s) => s.clear);

  // Orden activa que se está viendo (mesa ocupada o para llevar ya enviada)
  const [currentOrderId, setCurrentOrderId] = useState<string | null>(null);
  const [paying,     setPaying]     = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [announcement, setAnnouncement] = useState('');

  // ── Datos ──
  const tables       = useTables();
  const activeOrders = useOrders([...ACTIVE]);
  const order        = useOrder(currentOrderId);

  const createOrder = useCreateOrder();
  const addItems    = useAddItems();
  const advance     = useUpdateOrderStatus();
  const cancel      = useCancelOrder();

  const takeoutOrders = useMemo(
    () => (activeOrders.data ?? []).filter((o) => o.type === 'TAKEOUT'),
    [activeOrders.data],
  );
  const selectedTable = tables.data?.find((t) => t.id === tableId) ?? null;
  const takeoutMode   = orderType === 'TAKEOUT';

  const contextLabel = selectedTable
    ? `Mesa ${selectedTable.number}`
    : takeoutMode
      ? (order.data ? `Para llevar #${order.data.ticketNumber}` : 'Para llevar (nueva)')
      : null;

  const currentOrder = order.data;
  const canEdit = canTakeOrders(role) && !!contextLabel && (!currentOrder || isActiveOrder(currentOrder.status));

  // Anuncios para lectores de pantalla (el espacio alterno fuerza a repetir mensajes iguales)
  const announce = (msg: string) => setAnnouncement((prev) => (prev === msg ? `${msg}${NBSP}` : msg));

  const resetMutations = () => { createOrder.reset(); addItems.reset(); advance.reset(); cancel.reset(); };

  // ── Selección de contexto ──
  const selectTable = (t: Table) => {
    setTable(t.id);
    setCurrentOrderId(t.activeOrder?.id ?? null);
    resetMutations();
    announce(t.activeOrder
      ? `Mesa ${t.number} seleccionada, ticket ${t.activeOrder.ticketNumber}`
      : `Mesa ${t.number} seleccionada, nueva orden`);
  };

  const newTakeout = () => {
    setOrderType('TAKEOUT');
    setCurrentOrderId(null);
    resetMutations();
    announce('Nueva orden para llevar');
  };

  const selectTakeoutOrder = (o: Order) => {
    setOrderType('TAKEOUT');
    setCurrentOrderId(o.id);
    resetMutations();
    announce(`Para llevar, ticket ${o.ticketNumber} seleccionado`);
  };

  // ── Catálogo → borrador ──
  const handleAdd = (p: Product) => {
    addItem({ productId: p.id, name: p.name, unitPrice: toNum(p.price) });
    const total = selectDraftTotal(usePosDraftStore.getState());
    announce(`${p.name} agregado. Total por enviar ${centsToMXN(Math.round(total * 100))}`);
  };

  // ── Enviar a cocina: crea la orden o agrega una ronda, y la pasa a IN_KITCHEN ──
  const sending = createOrder.isPending || addItems.isPending || advance.isPending;

  const handleSend = async () => {
    if (sending || items.length === 0) return;
    const payload = items.map((i) => ({
      productId: i.productId,
      quantity:  i.quantity,
      notes:     i.notes?.trim() || undefined,
    }));
    try {
      const result = currentOrderId
        ? await addItems.mutateAsync({ orderId: currentOrderId, items: payload })
        : await createOrder.mutateAsync({
            type:         orderType,
            tableId:      orderType === 'DINE_IN' ? tableId ?? undefined : undefined,
            customerName: orderType === 'TAKEOUT' ? customerName?.trim() || undefined : undefined,
            items:        payload,
          });
      clearDraft();
      setCurrentOrderId(result.id);
      if (result.status === 'OPEN') await advance.mutateAsync({ orderId: result.id, status: 'IN_KITCHEN' });
      announce(`Ticket ${result.ticketNumber} enviado a cocina`);
    } catch {
      // El error se muestra desde el estado de la mutación correspondiente
    }
  };

  const handleAdvance = (status: 'IN_KITCHEN' | 'SERVED') => {
    if (!currentOrder) return;
    advance.mutate(
      { orderId: currentOrder.id, status },
      { onSuccess: (o) => announce(`Ticket ${o.ticketNumber}: ${status === 'SERVED' ? 'servida' : 'en cocina'}`) },
    );
  };

  const handleCancel = () => {
    if (!currentOrder) return;
    cancel.mutate(currentOrder.id, {
      onSuccess: (o) => {
        setConfirming(false);
        setCurrentOrderId(null);
        announce(`Ticket ${o.ticketNumber} cancelado`);
      },
    });
  };

  const handlePaymentClose = (paid: boolean) => {
    setPaying(false);
    if (paid) {
      announce('Cobro completado');
      setCurrentOrderId(null); // la mesa queda libre para una orden nueva
    }
  };

  if (!canTakeOrders(role)) {
    return (
      <div className="bg-white rounded-2xl border border-caramel/10 p-10 text-center flex flex-col items-center gap-2">
        <Lock size={28} className="text-espresso/70" aria-hidden="true" />
        <p className="font-semibold text-espresso">Sin acceso al punto de venta</p>
        <p className="text-sm text-espresso/70">Tu rol no puede tomar ni cobrar órdenes.</p>
      </div>
    );
  }

  const sendErrorRaw  = createOrder.error || addItems.error;
  const sendError     = sendErrorRaw ? describeApiError(sendErrorRaw, 'order') : null;
  const statusError   = advance.error ? describeApiError(advance.error, 'status').message : null;
  const orderLoadErr  = order.error ? describeApiError(order.error, 'load').message : null;

  return (
    <div className="pb-20 lg:pb-0 grid gap-4 lg:grid-cols-[minmax(0,1fr)_380px] lg:items-start">
      <p className="sr-only" role="status" aria-live="polite">{announcement}</p>

      <div className="flex flex-col gap-4 min-w-0">
        <TableGrid
          tables={tables.data}
          isLoading={tables.isLoading}
          error={tables.error}
          onRetry={() => tables.refetch()}
          selectedTableId={tableId}
          takeoutSelected={takeoutMode}
          takeoutOrders={takeoutOrders}
          currentOrderId={currentOrderId}
          onSelectTable={selectTable}
          onNewTakeout={newTakeout}
          onSelectOrder={selectTakeoutOrder}
        />
        <ProductPicker disabled={!canEdit} onAdd={handleAdd} />
      </div>

      <div className="lg:sticky lg:top-0">
        <TicketPanel
          contextLabel={contextLabel}
          order={currentOrder}
          orderLoading={order.isLoading}
          orderError={orderLoadErr}
          canEdit={canEdit}
          sending={sending}
          sendError={sendError}
          onSend={handleSend}
          statusBar={currentOrder && (
            <OrderStatusBar
              order={currentOrder}
              role={role}
              statusPending={advance.isPending || cancel.isPending}
              statusError={statusError}
              onAdvance={handleAdvance}
              onPay={() => setPaying(true)}
              onCancel={() => { cancel.reset(); setConfirming(true); }}
            />
          )}
        />
      </div>

      {paying && currentOrder && <PaymentModal order={currentOrder} onClose={handlePaymentClose} />}

      {confirming && currentOrder && (
        <ConfirmCancelDialog
          ticketNumber={currentOrder.ticketNumber}
          pending={cancel.isPending}
          error={cancel.error ? describeApiError(cancel.error, 'cancel').message : null}
          onConfirm={handleCancel}
          onClose={() => setConfirming(false)}
        />
      )}
    </div>
  );
}
