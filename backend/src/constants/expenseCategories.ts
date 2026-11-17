// Categorías de gasto. Lista idéntica en frontend/src/constants/expenseCategories.ts
// (no hay paquete compartido entre backend y frontend; una prueba verifica que coincidan).
export const EXPENSE_CATEGORIES = ['INSUMOS', 'NOMINA', 'RENTA', 'SERVICIOS', 'MANTENIMIENTO', 'OTROS'] as const;

export type ExpenseCategory = (typeof EXPENSE_CATEGORIES)[number];
