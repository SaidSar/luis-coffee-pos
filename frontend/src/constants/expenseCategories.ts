// Categorías de gasto. Lista idéntica en backend/src/constants/expenseCategories.ts
// (no hay paquete compartido entre backend y frontend; una prueba verifica que coincidan).
export const EXPENSE_CATEGORIES = ['INSUMOS', 'NOMINA', 'RENTA', 'SERVICIOS', 'MANTENIMIENTO', 'OTROS'] as const;

export type ExpenseCategory = (typeof EXPENSE_CATEGORIES)[number];

export const EXPENSE_CATEGORY_LABEL: Record<ExpenseCategory, string> = {
  INSUMOS:       'Insumos',
  NOMINA:        'Nómina',
  RENTA:         'Renta',
  SERVICIOS:     'Servicios',
  MANTENIMIENTO: 'Mantenimiento',
  OTROS:         'Otros',
};
