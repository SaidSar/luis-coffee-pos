// Respuesta de GET /api/dashboard. Los bloques ausentes no los envía el servidor para ese rol.
export type PayMethod = 'CASH' | 'CARD' | 'TRANSFER';

export interface DashboardOperations {
  tables:       { total: number; occupied: number };
  activeOrders: { count: number; pending: number; scope: 'all' | 'mine' };
  deliveries:   { PENDING: number; IN_TRANSIT: number };
  cash:         { open: boolean; openedAt: string | null };
  lowStock:     { threshold: number; items: { id: string; name: string; stock: number }[] };
}

export interface DashboardSales {
  total:         number;
  tickets:       number;
  averageTicket: number;
  comparison:    { yesterdaySameTime: number; yesterdayTickets: number; delta: number; pct: number | null };
  byHour:        { hour: number; sales: number; tickets: number }[];
  topProducts:   { productId: string; name: string; quantity: number; sales: number }[];
  byMethod:      { method: PayMethod; sales: number; tickets: number }[];
}

export interface DashboardFinance {
  cost:      number;
  expenses:  number;
  profit:    number;
  last7Days: { date: string; sales: number; tickets: number }[];
}

export interface DashboardData {
  date:        string;
  generatedAt: string;
  operations:  DashboardOperations;
  sales?:      DashboardSales;   // ADMIN y CASHIER
  finance?:    DashboardFinance; // solo ADMIN
}
