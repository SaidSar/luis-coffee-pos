import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { tablesService, ordersService } from '../services/posService';
import { useRealtimeStore } from '../stores/realtimeStore';
import type { Order, CreateOrderInput, OrderItemInput, OrderStatus, OrderStatusChange, PayOrderInput } from '../types/pos';

const TABLES   = ['tables'] as const;
const ORDERS   = ['orders'] as const;
const PRODUCTS = ['products'] as const;

// Polling de respaldo: con el socket en línea los cambios llegan por eventos (60 s basta);
// sin conexión en tiempo real se vuelve a 15 s
const REFRESH_ONLINE_MS  = 60_000;
const REFRESH_OFFLINE_MS = 15_000;
const useRefreshInterval = () =>
  useRealtimeStore((s) => (s.status === 'connected' ? REFRESH_ONLINE_MS : REFRESH_OFFLINE_MS));

// Invalida mesas y órdenes después de cualquier cambio (el servidor es la fuente de verdad)
const useInvalidatePos = () => {
  const qc = useQueryClient();
  return (withProducts = false) => {
    qc.invalidateQueries({ queryKey: TABLES });
    qc.invalidateQueries({ queryKey: ORDERS });
    if (withProducts) qc.invalidateQueries({ queryKey: PRODUCTS });
  };
};

// Cada mutación devuelve la orden actualizada: se guarda ya en la caché del detalle
// para que la UI no muestre un estado viejo mientras llega el refetch
const useCacheOrder = () => {
  const qc = useQueryClient();
  return (order: Order) => qc.setQueryData([...ORDERS, 'detail', order.id], order);
};

// ── Consultas ─────────────────────────────────────────────────
export const useTables = () => {
  const refetchInterval = useRefreshInterval();
  return useQuery({ queryKey: TABLES, queryFn: tablesService.list, refetchInterval });
};

export const useOrders = (statuses?: OrderStatus[]) => {
  const refetchInterval = useRefreshInterval();
  return useQuery({
    queryKey: [...ORDERS, 'list', statuses?.join(',') ?? 'all'],
    queryFn:  () => ordersService.list(statuses),
    refetchInterval,
  });
};

export const useOrder = (id: string | null) =>
  useQuery({
    queryKey: [...ORDERS, 'detail', id],
    queryFn:  () => ordersService.get(id!),
    enabled:  !!id,
  });

// ── Mutaciones ────────────────────────────────────────────────
export const useCreateOrder = () => {
  const invalidate = useInvalidatePos();
  const cache      = useCacheOrder();
  return useMutation({
    mutationFn: (input: CreateOrderInput) => ordersService.create(input),
    onSuccess:  cache,
    onSettled:  () => invalidate(),
  });
};

// Nueva ronda sobre una orden activa
export const useAddItems = () => {
  const invalidate = useInvalidatePos();
  const cache      = useCacheOrder();
  return useMutation({
    mutationFn: ({ orderId, items }: { orderId: string; items: OrderItemInput[] }) =>
      ordersService.addItems(orderId, items),
    onSuccess: cache,
    onSettled: () => invalidate(),
  });
};

export const useUpdateOrderStatus = () => {
  const invalidate = useInvalidatePos();
  const cache      = useCacheOrder();
  return useMutation({
    mutationFn: ({ orderId, status }: { orderId: string; status: Exclude<OrderStatusChange, 'CANCELLED'> }) =>
      ordersService.updateStatus(orderId, status),
    onSuccess: cache,
    onSettled: () => invalidate(),
  });
};

export const useCancelOrder = () => {
  const invalidate = useInvalidatePos();
  const cache      = useCacheOrder();
  return useMutation({
    mutationFn: (orderId: string) => ordersService.updateStatus(orderId, 'CANCELLED'),
    onSuccess:  cache,
    onSettled:  () => invalidate(),
  });
};

// El cobro puede descontar stock: también invalida productos
export const usePayOrder = () => {
  const invalidate = useInvalidatePos();
  const cache      = useCacheOrder();
  return useMutation({
    mutationFn: ({ orderId, input }: { orderId: string; input: PayOrderInput }) =>
      ordersService.pay(orderId, input),
    onSuccess: cache,
    onSettled: () => invalidate(true),
  });
};
