import { useQuery, useMutation, keepPreviousData } from '@tanstack/react-query';
import { reportsService } from '../services/reportsService';
import type { GroupBy, ReportQuery } from '../types/reports';

const key = (name: string, q: ReportQuery) => ['reports', name, q.from, q.to, q.groupBy ?? null] as const;

// keepPreviousData: al cambiar de periodo se ve el dato anterior hasta que llega el nuevo
const opts = { placeholderData: keepPreviousData, staleTime: 60_000 } as const;

export const useReportSummary = (q: ReportQuery) =>
  useQuery({ queryKey: key('summary', q), queryFn: () => reportsService.summary(q), ...opts });

export const useReportSales = (q: ReportQuery, groupBy: GroupBy) => {
  const query = { ...q, groupBy };
  return useQuery({ queryKey: key('sales', query), queryFn: () => reportsService.sales(query), ...opts });
};

export const useReportProducts = (q: ReportQuery) =>
  useQuery({ queryKey: key('products', q), queryFn: () => reportsService.products(q), ...opts });

export const useReportPaymentMethods = (q: ReportQuery) =>
  useQuery({ queryKey: key('payment-methods', q), queryFn: () => reportsService.paymentMethods(q), ...opts });

export const useReportEmployees = (q: ReportQuery) =>
  useQuery({ queryKey: key('employees', q), queryFn: () => reportsService.employees(q), ...opts });

export const useExportExcel = () =>
  useMutation({ mutationFn: (q: ReportQuery) => reportsService.exportExcel(q) });
