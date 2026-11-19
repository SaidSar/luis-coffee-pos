import { REPORT_TZ } from '../../lib/mazatlanDates';
import type { EmployeeRole } from '../../types/employees';

export const ROLE_OPTIONS: { value: EmployeeRole; label: string }[] = [
  { value: 'ADMIN', label: 'Administrador' }, { value: 'CASHIER', label: 'Cajero' }, { value: 'WAITER', label: 'Mesero' },
];
export const ROLE_ES: Record<string, string> = { ADMIN: 'Administrador', CASHIER: 'Cajero', WAITER: 'Mesero', DELIVERY: 'Repartidor' };

// Última sesión en hora de Mazatlán
const dtFmt = new Intl.DateTimeFormat('es-MX', { timeZone: REPORT_TZ, dateStyle: 'short', timeStyle: 'short' });
export const lastLogin = (v: string | null) => (v ? dtFmt.format(new Date(v)) : 'Nunca');
