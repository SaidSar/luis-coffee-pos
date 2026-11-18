import { useQuery } from '@tanstack/react-query';
import { dashboardService } from '../services/dashboardService';
import { useRealtimeStore } from '../stores/realtimeStore';

// Los eventos del socket invalidan ['dashboard']; el refetch periódico es solo respaldo
// (60 s con el socket en línea, 15 s si está caído)
export const useDashboard = () => {
  const refetchInterval = useRealtimeStore((s) => (s.status === 'connected' ? 60_000 : 15_000));
  return useQuery({ queryKey: ['dashboard'], queryFn: dashboardService.get, refetchInterval, staleTime: 0 });
};
