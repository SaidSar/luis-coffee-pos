import { useEffect } from 'react';
import { useQueryClient, type QueryClient } from '@tanstack/react-query';
import { useAuthStore } from '../stores/authStore';
import { connectSocket, disconnectSocket, getSocket } from '../services/socket';
import type { Order, Table, TableStatus } from '../types/pos';

// Eventos reales del backend (services/socket.service.ts):
//   order:created | order:updated | order:paid → vista completa de la orden (con id, tableId, status, ticketNumber)
//   table:updated                              → { id, number, capacity, status, active, mergedIntoId }
//   delivery:updated                           → { id, orderId, ticketNumber, status, orderStatus, paid }
//   cash:updated                               → { open, shiftId }
const DEBOUNCE_MS = 150;
const ACTIVE = new Set(['OPEN', 'IN_KITCHEN', 'SERVED']);

const isOrder = (v: unknown): v is Order =>
  typeof v === 'object' && v !== null && typeof (v as Order).id === 'string'
  && typeof (v as Order).status === 'string' && typeof (v as Order).ticketNumber === 'number';

const isTableUpdate = (v: unknown): v is TableUpdate =>
  typeof v === 'object' && v !== null && typeof (v as Table).id === 'string' && typeof (v as Table).status === 'string';

// Aplica el payload a la caché para que la UI cambie al instante (luego se refetchea por consistencia)
const patchOrder = (qc: QueryClient, order: Order) => {
  qc.setQueryData<Order>(['orders', 'detail', order.id], order);
  if (!order.tableId) return;
  qc.setQueryData<Table[]>(['tables'], (tables) => tables?.map((t) => {
    if (t.id !== order.tableId) return t;
    return ACTIVE.has(order.status)
      ? { ...t, activeOrder: { id: order.id, ticketNumber: order.ticketNumber, status: order.status } }
      : (t.activeOrder?.id === order.id ? { ...t, activeOrder: null } : t);
  }));
};

// table:updated trae status, active y mergedIntoId: se aplican y se recalculan los grupos
// (números de la principal y de las secundarias) para no mostrar un estado intermedio inconsistente
type TableUpdate = Pick<Table, 'id' | 'status'> & Partial<Pick<Table, 'active' | 'mergedIntoId'>>;
const patchTable = (qc: QueryClient, upd: TableUpdate) => {
  qc.setQueryData<Table[]>(['tables'], (tables) => {
    if (!tables) return tables;
    const patched = tables
      .map((t) => (t.id === upd.id ? {
        ...t,
        status: upd.status as TableStatus,
        ...(upd.active !== undefined ? { active: upd.active } : {}),
        ...(upd.mergedIntoId !== undefined ? { mergedIntoId: upd.mergedIntoId } : {}),
      } : t))
      .filter((t) => t.active !== false); // la lista del POS solo tiene mesas activas
    return patched.map((t) => ({
      ...t,
      mergedIntoNumber: t.mergedIntoId ? patched.find((p) => p.id === t.mergedIntoId)?.number ?? t.mergedIntoNumber : null,
      mergedNumbers: patched.filter((x) => x.mergedIntoId === t.id).map((x) => x.number).sort((a, b) => a - b),
    }));
  });
};

// Montar UNA vez en el layout protegido. Abre el socket con sesión y lo cierra al cerrar sesión.
export function useRealtime() {
  const token = useAuthStore((s) => s.token);
  const qc    = useQueryClient();

  // Ciclo de vida de la conexión ligado al token (login, logout, token nuevo)
  useEffect(() => {
    if (!token) {
      disconnectSocket();
      return;
    }
    connectSocket(token);
    return () => disconnectSocket();
  }, [token]);

  // Listeners: se registran y se quitan en cada montaje (sin duplicados en StrictMode)
  useEffect(() => {
    const socket = getSocket();
    let timer: ReturnType<typeof setTimeout> | null = null;
    let withProducts = false;
    let withDeliveries = false;
    let hadConnection = socket.connected;

    // Agrupa ráfagas de eventos en una sola invalidación
    const scheduleInvalidate = (products = false, deliveries = false) => {
      withProducts ||= products;
      withDeliveries ||= deliveries;
      if (timer) return;
      timer = setTimeout(() => {
        timer = null;
        qc.invalidateQueries({ queryKey: ['tables'] });
        qc.invalidateQueries({ queryKey: ['orders'] });
        // Cobros y órdenes cambian los totales y pendientes de la caja
        qc.invalidateQueries({ queryKey: ['cash'] });
        if (withProducts) qc.invalidateQueries({ queryKey: ['products'] });
        if (withDeliveries) qc.invalidateQueries({ queryKey: ['deliveries'] });
        withProducts = false;
        withDeliveries = false;
      }, DEBOUNCE_MS);
    };

    const onOrder = (payload: unknown) => {
      if (isOrder(payload)) patchOrder(qc, payload);
      scheduleInvalidate();
    };
    const onPaid = (payload: unknown) => {
      if (isOrder(payload)) patchOrder(qc, payload);
      scheduleInvalidate(true); // el cobro puede descontar stock
    };
    const onTable = (payload: unknown) => {
      if (isTableUpdate(payload)) patchTable(qc, payload);
      scheduleInvalidate();
    };
    // Entregas: invalida tablero y órdenes (el payload es parcial, no se parchea la caché)
    const onDelivery = () => scheduleInvalidate(false, true);
    const onCash = () => scheduleInvalidate();
    // Al reconectar se pudieron perder eventos: resincroniza todo
    const onConnect = () => {
      if (hadConnection) scheduleInvalidate(true, true);
      hadConnection = true;
    };

    socket.on('order:created', onOrder);
    socket.on('order:updated', onOrder);
    socket.on('order:paid',    onPaid);
    socket.on('table:updated', onTable);
    socket.on('delivery:updated', onDelivery);
    socket.on('cash:updated', onCash);
    socket.on('connect',       onConnect);

    return () => {
      socket.off('order:created', onOrder);
      socket.off('order:updated', onOrder);
      socket.off('order:paid',    onPaid);
      socket.off('table:updated', onTable);
      socket.off('delivery:updated', onDelivery);
      socket.off('cash:updated', onCash);
      socket.off('connect',       onConnect);
      if (timer) clearTimeout(timer);
    };
  }, [qc]);
}
