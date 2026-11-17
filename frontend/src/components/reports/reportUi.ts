// Formato y clases compartidas de la pantalla de reportes
export const mxn = new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN' });
export const int = new Intl.NumberFormat('es-MX', { maximumFractionDigits: 0 });
export const pct = new Intl.NumberFormat('es-MX', { style: 'percent', maximumFractionDigits: 1 });

export const formatMoney = (v: number) => mxn.format(v);

export const PAYMENT_LABEL = { CASH: 'Efectivo', CARD: 'Tarjeta', TRANSFER: 'Transferencia' } as const;
export const ROLE_LABEL: Record<string, string> = { ADMIN: 'Administrador', CASHIER: 'Cajero', WAITER: 'Mesero', DELIVERY: 'Repartidor' };

export const focusRing =
  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-caramel-dark focus-visible:ring-offset-2';

export const card = 'bg-white rounded-2xl border border-caramel/10 p-4';
