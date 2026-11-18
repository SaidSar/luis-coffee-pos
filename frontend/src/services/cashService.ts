import api from './api';
import type { CashCloseResult, CashCurrent, CashShift, CashShiftRow, CashStatus } from '../types/cash';

export const cashService = {
  status:  () => api.get<CashStatus>('/cash/status').then(r => r.data),
  current: () => api.get<CashCurrent>('/cash/current').then(r => r.data),
  open:    (openingFloat: string) => api.post<{ shift: CashShift }>('/cash/open', { openingFloat }).then(r => r.data),
  close:   (input: { countedCash: string; notes?: string }) => api.post<CashCloseResult>('/cash/close', input).then(r => r.data),
  shifts:  (q: { from: string; to: string }) =>
    api.get<{ items: CashShiftRow[] }>('/cash/shifts', { params: q }).then(r => r.data.items),
};
