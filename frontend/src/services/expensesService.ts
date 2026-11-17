import api from './api';
import type { Expense, ExpenseInput, ExpenseList, ExpenseQuery } from '../types/expenses';

// Una sola página de hasta 200 gastos (máximo del backend); count y total son del filtro completo
const PAGE = 200;

export const expensesService = {
  list: (q: ExpenseQuery) =>
    api.get<ExpenseList>('/expenses', {
      params: { from: q.from, to: q.to, limit: PAGE, ...(q.category ? { category: q.category } : {}) },
    }).then(r => r.data),

  create: (input: ExpenseInput) => api.post<Expense>('/expenses', input).then(r => r.data),

  update: (id: string, input: Partial<ExpenseInput>) => api.patch<Expense>(`/expenses/${id}`, input).then(r => r.data),

  remove: (id: string) => api.delete(`/expenses/${id}`).then(() => id),
};
