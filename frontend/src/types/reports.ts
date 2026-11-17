// Respuestas reales de /api/reports (backend/src/services/reports.service.ts). Montos en número con 2 decimales.

export type GroupBy = 'day' | 'week' | 'month';

export interface ReportQuery { from: string; to: string; groupBy?: GroupBy }

export interface ReportSummary {
  from: string; to: string;
  sales: number; tickets: number; averageTicket: number;
  cost: number; grossMargin: number; grossMarginPct: number;
  expenses: number; profit: number;
  itemsSold: number; cancelledOrders: number;
}

export interface SalesPeriod { period: string; label: string; tickets: number; sales: number; cost: number; grossMargin: number }

export interface ProductReportRow {
  productId: string; product: string; category: string;
  quantity: number; sales: number; cost: number; grossMargin: number; grossMarginPct: number;
}

export interface PaymentMethodReportRow { method: 'CASH' | 'CARD' | 'TRANSFER'; tickets: number; sales: number }

export interface EmployeeReportRow { userId: string; employee: string; role: string; tickets: number; sales: number; averageTicket: number }
