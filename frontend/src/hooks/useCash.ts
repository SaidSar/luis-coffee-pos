import { useQuery, useMutation, useQueryClient, keepPreviousData } from '@tanstack/react-query';
import { cashService } from '../services/cashService';
import { useRealtimeStore } from '../stores/realtimeStore';
import { useAuthStore } from '../stores/authStore';

const CASH = ['cash'] as const;

// Con el socket en línea los cambios llegan por cash:updated / order:paid; sin conexión se refresca cada 15 s
const useRefresh = () => useRealtimeStore((s) => (s.status === 'connected' ? 60_000 : 15_000));

// Abierta/cerrada, sin montos (todo el personal que toma órdenes)
export const useCashStatus = () => {
  const role = useAuthStore((s) => s.user?.role);
  const refetchInterval = useRefresh();
  return useQuery({
    queryKey: [...CASH, 'status'],
    queryFn:  cashService.status,
    enabled:  role === 'ADMIN' || role === 'CASHIER' || role === 'WAITER',
    refetchInterval,
    staleTime: 30_000,
  });
};

export const useCashCurrent = () => {
  const refetchInterval = useRefresh();
  return useQuery({ queryKey: [...CASH, 'current'], queryFn: cashService.current, refetchInterval, staleTime: 0 });
};

export const useCashShifts = (q: { from: string; to: string }, enabled: boolean) =>
  useQuery({
    queryKey:        [...CASH, 'shifts', q.from, q.to],
    queryFn:         () => cashService.shifts(q),
    placeholderData: keepPreviousData,
    enabled,
  });

const useInvalidateCash = () => {
  const qc = useQueryClient();
  return () => qc.invalidateQueries({ queryKey: CASH });
};

export const useOpenCash = () => {
  const invalidate = useInvalidateCash();
  return useMutation({ mutationFn: (openingFloat: string) => cashService.open(openingFloat), onSettled: invalidate });
};

export const useCloseCash = () => {
  const invalidate = useInvalidateCash();
  return useMutation({
    mutationFn: (input: { countedCash: string; notes?: string }) => cashService.close(input),
    onSettled:  invalidate,
  });
};
