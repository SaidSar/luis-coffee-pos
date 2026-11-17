import { isAxiosError } from 'axios';

// Contexto de la operación: el mismo status significa cosas distintas según dónde ocurra
export type ErrorContext = 'load' | 'order' | 'status' | 'payment' | 'cancel' | 'report';

export interface ApiErrorInfo {
  status:   number | null;
  message:  string;   // mensaje propio, decidido por status + contexto (nunca err.message)
  products: string[]; // nombres de producto que el servidor devuelve en details.products (409)
}

const readProducts = (data: unknown): string[] => {
  if (typeof data !== 'object' || data === null || !('details' in data)) return [];
  const details = (data as { details: unknown }).details;
  if (typeof details !== 'object' || details === null || !('products' in details)) return [];
  const products = (details as { products: unknown }).products;
  return Array.isArray(products) ? products.filter((p): p is string => typeof p === 'string') : [];
};

const conflictMessage = (ctx: ErrorContext, hasProducts: boolean): string => {
  if (ctx === 'payment') {
    return hasProducts
      ? 'No hay stock suficiente para cobrar estos productos:'
      : 'Esta orden ya fue pagada o cancelada. Se actualizó la vista.';
  }
  if (ctx === 'order') {
    return hasProducts
      ? 'No se pudo enviar: estos productos no tienen stock o ya no están disponibles:'
      : 'La orden ya no admite cambios. Se actualizó la vista.';
  }
  if (ctx === 'cancel') return 'No se puede cancelar: la orden ya fue pagada o cancelada.';
  if (ctx === 'status') return 'Ese cambio de estado ya no es posible. Se actualizó la vista.';
  return 'Conflicto con el estado actual. Recarga la página.';
};

export const describeApiError = (err: unknown, ctx: ErrorContext): ApiErrorInfo => {
  if (!isAxiosError(err)) {
    return { status: null, message: 'Ocurrió un error inesperado. Intenta de nuevo.', products: [] };
  }
  if (!err.response) {
    return { status: null, message: 'Sin conexión con el servidor. Revisa tu red e intenta de nuevo.', products: [] };
  }

  const { status, data } = err.response;
  const products = readProducts(data);

  let message: string;
  if (status === 400) {
    message = ctx === 'payment'
      ? 'El monto no es válido para este método de pago.'
      : ctx === 'report'
        ? 'El periodo no es válido: "Desde" no puede ser posterior a "Hasta" y el máximo es de 366 días.'
        : 'Revisa los datos e intenta de nuevo.';
  } else if (status === 401) {
    message = 'Tu sesión expiró. Vuelve a iniciar sesión.';
  } else if (status === 403) {
    message = ctx === 'report' ? 'Solo un administrador puede ver y exportar los reportes.' : 'No tienes permiso para esta acción.';
  } else if (status === 404) {
    message = ctx === 'load' ? 'No se encontró la información solicitada.' : 'La orden, mesa o producto ya no existe. Se actualizó la vista.';
  } else if (status === 409) {
    message = conflictMessage(ctx, products.length > 0);
  } else if (status >= 500) {
    message = 'Error del servidor. Intenta de nuevo en un momento.';
  } else {
    message = 'No se pudo completar la acción. Intenta de nuevo.';
  }

  return { status, message, products };
};
