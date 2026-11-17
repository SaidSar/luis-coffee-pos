import { useQuery, useMutation, useQueryClient, keepPreviousData } from '@tanstack/react-query';
import { expensesService } from '../services/expensesService';
import type { ExpenseInput, ExpenseQuery } from '../types/expenses';

const EXPENSES = ['expenses'] as const;
const REPORTS  = ['reports'] as const;

export const useExpenses = (q: ExpenseQuery) =>
  useQuery({
    queryKey:        [...EXPENSES, q.from, q.to, q.category ?? 'all'],
    queryFn:         () => expensesService.list(q),
    placeholderData: keepPreviousData,
  });

// Cualquier cambio en gastos altera la utilidad: se invalidan gastos y reportes
const useInvalidate = () => {
  const qc = useQueryClient();
  return () => {
    qc.invalidateQueries({ queryKey: EXPENSES });
    qc.invalidateQueries({ queryKey: REPORTS });
  };
};

export const useCreateExpense = () => {
  const invalidate = useInvalidate();
  return useMutation({ mutationFn: (input: ExpenseInput) => expensesService.create(input), onSuccess: invalidate });
};

export const useUpdateExpense = () => {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: Partial<ExpenseInput> }) => expensesService.update(id, input),
    // onSettled: si falla (p. ej. 404 porque otra sesión lo borró) también se refresca la lista
    onSettled:  invalidate,
  });
};

export const useDeleteExpense = () => {
  const invalidate = useInvalidate();
  return useMutation({ mutationFn: (id: string) => expensesService.remove(id), onSettled: invalidate });
};
