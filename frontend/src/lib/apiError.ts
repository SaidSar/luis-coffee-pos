import { isAxiosError } from 'axios';

// Contexto de la operación: el mismo status significa cosas distintas según dónde ocurra
export type ErrorContext = 'load' | 'order' | 'status' | 'payment' | 'cancel' | 'report' | 'expense' | 'cash' | 'tables';

// Errores por campo que devuelve el backend en details (validación zod): { path, message }[]
export const fieldErrorsFrom = (err: unknown): Record<string, string> => {
  if (!isAxiosError(err)) return {};
  const details = (err.response?.data as { details?: unknown } | undefined)?.details;
  if (!Array.isArray(details)) return {};
  const out: Record<string, string> = {};
  for (const d of details) {
    if (d && typeof d === 'object' && typeof (d as { path?: unknown }).path === 'string' && typeof (d as { message?: unknown }).message === 'string') {
      const { path, message } = d as { path: string; message: string };
      out[path] ??= message;
    }
  }
  return out;
};

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
  if (ctx === 'tables') return 'No se pudo: alguna mesa está ocupada, unida a otra o desactivada. Se actualizó la vista.';
  if (ctx === 'cash') return 'La caja cambió en otra sesión (ya estaba abierta o cerrada). Se actualizó la vista.';
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
        : ctx === 'expense' || ctx === 'cash'
          ? 'Revisa los campos marcados e intenta de nuevo.'
          : 'Revisa los datos e intenta de nuevo.';
  } else if (status === 401) {
    message = 'Tu sesión expiró. Vuelve a iniciar sesión.';
  } else if (status === 403) {
    message = ctx === 'report' ? 'Solo un administrador puede ver y exportar los reportes.'
      : ctx === 'expense' ? 'Solo un administrador puede gestionar los gastos.'
      : ctx === 'cash' ? 'Solo cajeros y administradores pueden operar la caja.'
      : ctx === 'tables' ? 'Tu rol no puede hacer este cambio en las mesas.'
      : 'No tienes permiso para esta acción.';
  } else if (status === 404) {
    message = ctx === 'load' ? 'No se encontró la información solicitada.'
      : ctx === 'expense' ? 'Este gasto ya no existe. Se actualizó la lista.'
      : 'La orden, mesa o producto ya no existe. Se actualizó la vista.';
  } else if (status === 409) {
    message = conflictMessage(ctx, products.length > 0);
  } else if (status >= 500) {
    message = 'Error del servidor. Intenta de nuevo en un momento.';
  } else {
    message = 'No se pudo completar la acción. Intenta de nuevo.';
  }

  return { status, message, products };
};

// Empleados: mensajes por status y por el código que manda el servidor en details.code (nunca el texto crudo)
const EMPLOYEE_409: Record<string, string> = {
  SELF_ACTION:  'No puedes hacer esto sobre tu propia cuenta (desactivarte, cambiar tu rol o restablecer tu contraseña).',
  LAST_ADMIN:   'Debe quedar al menos un administrador activo.',
  OPEN_SHIFT:   'Tiene un turno de caja abierto: ciérralo antes de desactivarlo.',
  EMAIL_TAKEN:  'Ya existe un empleado con ese correo.',
};
export const describeEmployeeError = (err: unknown): string => {
  if (!isAxiosError(err)) return 'Ocurrió un error inesperado. Intenta de nuevo.';
  if (!err.response) return 'Sin conexión con el servidor. Revisa tu red e intenta de nuevo.';
  const { status, data } = err.response;
  const code = (data as { details?: { code?: string } } | undefined)?.details?.code;
  if (status === 409) return (code && EMPLOYEE_409[code]) || 'El empleado cambió en otra sesión. Se actualizó la lista.';
  if (status === 400) return 'Revisa los campos marcados e intenta de nuevo.';
  if (status === 403) return 'Solo un administrador puede gestionar a los empleados.';
  if (status === 404) return 'Este empleado ya no existe. Se actualizó la lista.';
  return 'No se pudo completar la acción. Intenta de nuevo.';
};
