import api from './api';
import type {
  Table, Order, OrderStatus, OrderStatusChange, CreateOrderInput, OrderItemInput, PayOrderInput,
} from '../types/pos';

export const tablesService = {
  list: (includeInactive = false) =>
    api.get<Table[]>('/tables', { params: includeInactive ? { includeInactive: 'true' } : undefined }).then(r => r.data),
  create:  (input: { number?: number; capacity?: number }) => api.post<Table>('/tables', input).then(r => r.data),
  update:  (id: string, input: { active?: boolean; capacity?: number; number?: number }) =>
    api.patch<Table>(`/tables/${id}`, input).then(r => r.data),
  // tableIds: números de las mesas a unir a la principal
  merge:   (id: string, tableIds: number[]) => api.post<Table[]>(`/tables/${id}/merge`, { tableIds }).then(r => r.data),
  unmerge: (id: string) => api.post<Table[]>(`/tables/${id}/unmerge`).then(r => r.data),
};

export const ordersService = {
  list: (statuses?: OrderStatus[]) =>
    api.get<Order[]>('/orders', { params: statuses?.length ? { status: statuses.join(',') } : undefined })
      .then(r => r.data),

  get: (id: string) => api.get<Order>(`/orders/${id}`).then(r => r.data),

  // 201 si crea; 200 si la mesa ya tenía orden activa y se agregó a ella
  create: (input: CreateOrderInput) => api.post<Order>('/orders', input).then(r => r.data),

  addItems: (id: string, items: OrderItemInput[]) =>
    api.post<Order>(`/orders/${id}/items`, { items }).then(r => r.data),

  updateStatus: (id: string, status: OrderStatusChange) =>
    api.patch<Order>(`/orders/${id}/status`, { status }).then(r => r.data),

  pay: (id: string, input: PayOrderInput) =>
    api.post<Order>(`/orders/${id}/payment`, input).then(r => r.data),
};
