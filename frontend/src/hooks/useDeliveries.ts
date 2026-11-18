import { useQuery, useMutation, useQueryClient, keepPreviousData } from '@tanstack/react-query';
import { deliveriesService } from '../services/deliveriesService';
import { useRealtimeStore } from '../stores/realtimeStore';

const DELIVERIES = ['deliveries'] as const;

// Con el socket en línea los cambios llegan por delivery:updated; sin conexión se refresca cada 15 s
export const useDeliveries = (q: { from: string; to: string }) => {
  const refetchInterval = useRealtimeStore((s) => (s.status === 'connected' ? 60_000 : 15_000));
  return useQuery({
    queryKey:        [...DELIVERIES, q.from, q.to],
    queryFn:         () => deliveriesService.list(q),
    placeholderData: keepPreviousData,
    refetchInterval,
  });
};

// Cambiar una entrega también altera la orden (POS): se invalidan ambas
const useInvalidate = () => {
  const qc = useQueryClient();
  return () => {
    qc.invalidateQueries({ queryKey: DELIVERIES });
    qc.invalidateQueries({ queryKey: ['orders'] });
  };
};

export const useSendDelivery = () => {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: ({ id, driverName }: { id: string; driverName: string }) => deliveriesService.send(id, driverName),
    onSettled:  invalidate,
  });
};

export const useDeliverDelivery = () => {
  const invalidate = useInvalidate();
  return useMutation({ mutationFn: (id: string) => deliveriesService.deliver(id), onSettled: invalidate });
};
