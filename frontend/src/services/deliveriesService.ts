import api from './api';
import type { DeliveryCard, DeliveryList } from '../types/pos';

// Una sola página de hasta 200 entregas (máximo del backend)
const PAGE = 200;

export const deliveriesService = {
  list: (q: { from: string; to: string }) =>
    api.get<DeliveryList>('/deliveries', { params: { from: q.from, to: q.to, limit: PAGE } }).then(r => r.data),

  send: (id: string, driverName: string) =>
    api.patch<DeliveryCard>(`/deliveries/${id}/status`, { status: 'IN_TRANSIT', driverName }).then(r => r.data),

  deliver: (id: string) =>
    api.patch<DeliveryCard>(`/deliveries/${id}/status`, { status: 'DELIVERED' }).then(r => r.data),
};
