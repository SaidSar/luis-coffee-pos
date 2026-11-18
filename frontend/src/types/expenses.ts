import type { ExpenseCategory } from '../constants/expenseCategories';

// Respuestas reales de /api/expenses (backend/src/controllers/expenses.controller.ts)
export interface Expense {
  id:          string;
  date:        string; // YYYY-MM-DD, día de negocio en America/Mazatlan
  description: string;
  category:    ExpenseCategory;
  notes:       string | null;
  paidFromCash: boolean; // salió del efectivo de la caja (resta en el corte)
  amount:      number;
  user:        { id: string; name: string };
}

export interface ExpenseList {
  items:  Expense[];
  count:  number; // total de gastos del filtro (no solo de esta página)
  total:  number; // suma de montos del filtro
  limit:  number;
  offset: number;
}

export interface ExpenseQuery { from: string; to: string; category?: ExpenseCategory }

export interface ExpenseInput {
  description: string;
  amount:      string;
  category:    ExpenseCategory;
  date:        string;
  notes:       string;
  paidFromCash: boolean;
}
