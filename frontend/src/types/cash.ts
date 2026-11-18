// Respuestas reales de /api/cash (backend/src/controllers/cash.controller.ts). Montos como texto con 2 decimales.

export type CashResult = 'OVER' | 'SHORT' | 'EVEN';

export interface CashUser { id: string; name: string }

export interface CashShift {
  id:            string;
  openedAt:      string;
  openedBy:      CashUser;
  openingFloat:  string;
  closedAt:      string | null;
  closedBy:      CashUser | null;
  countedCash:   string | null;
  expectedCash?: string | null; // ausente para CASHIER antes del cierre (cierre ciego)
  difference:    string | null;
  notes:         string | null;
}

export interface CashSales { CASH: string; CARD: string; TRANSFER: string; total: string; count: number }

export interface CashStatus { open: boolean; openedAt: string | null }

export type CashCurrent =
  | { open: false; pendingOrders: number }
  | {
      open: true;
      shift: CashShift;
      sales: CashSales;
      cashExpenses: { total: string; count: number };
      pendingOrders: number;
      expectedCash?: string; // solo ADMIN
    };

export interface CashCloseResult {
  shift:         CashShift;
  sales:         CashSales;
  cashExpenses:  { total: string; count: number };
  result:        CashResult;
  pendingOrders: number;
  warning?:      string;
}

export interface CashShiftRow extends CashShift { result: CashResult | null }
