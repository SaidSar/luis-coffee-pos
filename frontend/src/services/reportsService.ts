import api from './api';
import type {
  ReportQuery, ReportSummary, SalesPeriod, ProductReportRow, PaymentMethodReportRow, EmployeeReportRow,
} from '../types/reports';

const params = (q: ReportQuery) => ({ from: q.from, to: q.to, ...(q.groupBy ? { groupBy: q.groupBy } : {}) });

// Nombre del archivo desde Content-Disposition (el backend lo expone por CORS)
const filenameFrom = (header: unknown, fallback: string) => {
  if (typeof header !== 'string') return fallback;
  const match = header.match(/filename\*?=(?:UTF-8'')?"?([^";]+)"?/i);
  return match ? decodeURIComponent(match[1]) : fallback;
};

export const reportsService = {
  summary:        (q: ReportQuery) => api.get<ReportSummary>('/reports/summary', { params: params(q) }).then(r => r.data),
  sales:          (q: ReportQuery) => api.get<SalesPeriod[]>('/reports/sales', { params: params(q) }).then(r => r.data),
  products:       (q: ReportQuery) => api.get<ProductReportRow[]>('/reports/products', { params: params(q) }).then(r => r.data),
  paymentMethods: (q: ReportQuery) => api.get<PaymentMethodReportRow[]>('/reports/payment-methods', { params: params(q) }).then(r => r.data),
  employees:      (q: ReportQuery) => api.get<EmployeeReportRow[]>('/reports/employees', { params: params(q) }).then(r => r.data),

  // Descarga el .xlsx con el token (axios) y dispara la descarga en el navegador
  exportExcel: async (q: ReportQuery): Promise<string> => {
    const res = await api.get<Blob>('/reports/export', { params: params(q), responseType: 'blob' });
    const filename = filenameFrom(res.headers['content-disposition'], `luis-coffee-break_contabilidad_${q.from}_${q.to}.xlsx`);
    const url = URL.createObjectURL(res.data);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    // Se libera después de que el navegador tome el blob
    setTimeout(() => URL.revokeObjectURL(url), 1_000);
    return filename;
  },
};
