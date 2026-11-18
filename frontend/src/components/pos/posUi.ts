import {
  CircleCheck, Users, CalendarClock, Sparkles,
  ClipboardList, ChefHat, HandPlatter, CircleCheckBig, CircleX, Link2,
  type LucideIcon,
} from 'lucide-react';
import type { TableStatus, OrderStatus, PaymentMethod } from '../../types/pos';
import type { Role } from '../../types';

// ── Clases compartidas (targets ≥ 44px, foco visible con caramel-dark) ──
export const focusRing =
  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-caramel-dark focus-visible:ring-offset-2';

export const btnBase =
  `inline-flex items-center justify-center gap-2 min-h-11 min-w-11 px-4 rounded-xl text-sm font-semibold
   transition-colors disabled:opacity-60 disabled:cursor-not-allowed ${focusRing}`;

// Texto blanco solo sobre caramel-dark o espresso (contraste AA)
export const btnPrimary   = `${btnBase} bg-caramel-dark hover:bg-espresso text-white`;
export const btnDark      = `${btnBase} bg-espresso hover:bg-espresso/90 text-white`;
export const btnSecondary = `${btnBase} border border-espresso/50 bg-white text-espresso hover:bg-cream`;
export const btnDanger    = `${btnBase} bg-red-700 hover:bg-red-800 text-white`;
export const btnOutlineDanger = `${btnBase} border border-red-700 bg-white text-red-700 hover:bg-red-50`;

export const inputBase =
  `w-full min-h-11 px-3 rounded-xl border border-espresso/50 bg-white text-espresso text-sm
   placeholder:text-espresso/70 focus:outline-none focus:ring-2 focus:ring-caramel-dark`;

// ── Estados: siempre texto + icono, nunca solo color ──
interface StatusMeta { label: string; icon: LucideIcon; className: string }

export const tableStatusMeta: Record<TableStatus, StatusMeta> = {
  AVAILABLE: { label: 'Libre',     icon: CircleCheck,   className: 'bg-white border-espresso/50 text-espresso' },
  OCCUPIED:  { label: 'Ocupada',   icon: Users,         className: 'bg-espresso border-espresso text-white' },
  RESERVED:  { label: 'Reservada', icon: CalendarClock, className: 'bg-amber/20 border-espresso/50 text-espresso' },
  CLEANING:  { label: 'Limpieza',  icon: Sparkles,      className: 'bg-cream border-espresso/50 text-espresso' },
  MERGED:    { label: 'Unida',     icon: Link2,         className: 'bg-cream border-dashed border-espresso/50 text-espresso' },
};

// "Mesa 3 + 4 + 5" en la principal de un grupo
export const tableLabel = (t: { number: number; mergedNumbers?: number[] }) =>
  `Mesa ${[t.number, ...(t.mergedNumbers ?? [])].join(' + ')}`;

export const orderStatusMeta: Record<OrderStatus, StatusMeta> = {
  OPEN:       { label: 'Abierta',   icon: ClipboardList,  className: 'bg-cream text-espresso' },
  IN_KITCHEN: { label: 'En cocina', icon: ChefHat,        className: 'bg-amber/20 text-espresso' },
  SERVED:     { label: 'Servida',   icon: HandPlatter,    className: 'bg-green-100 text-green-800' },
  PAID:       { label: 'Pagada',    icon: CircleCheckBig, className: 'bg-green-100 text-green-800' },
  CANCELLED:  { label: 'Cancelada', icon: CircleX,        className: 'bg-red-50 text-red-700' },
};

export const paymentMethodLabel: Record<PaymentMethod, string> = {
  CASH:     'Efectivo',
  CARD:     'Tarjeta',
  TRANSFER: 'Transferencia',
};

// ── Permisos en UI (el backend sigue siendo la autoridad) ──
export const canTakeOrders = (role?: Role) => role === 'ADMIN' || role === 'CASHIER' || role === 'WAITER';
export const canCharge     = (role?: Role) => role === 'ADMIN' || role === 'CASHIER';

export const isActiveOrder = (status: OrderStatus) =>
  status === 'OPEN' || status === 'IN_KITCHEN' || status === 'SERVED';

// Montos: mismo formato que acepta el servidor (entero o hasta 2 decimales)
export const MONEY_RE = /^\d+(\.\d{1,2})?$/;

// Aritmética en centavos para evitar errores de coma flotante al mostrar
export const toCents = (v: string | number) => Math.round(parseFloat(String(v)) * 100);
const mxn = new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN' });
export const centsToMXN = (c: number) => mxn.format(c / 100);
