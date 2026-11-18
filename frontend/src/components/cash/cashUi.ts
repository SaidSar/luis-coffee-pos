import { CircleCheckBig, TrendingDown, TrendingUp, type LucideIcon } from 'lucide-react';
import { REPORT_TZ } from '../../lib/mazatlanDates';
import type { CashResult } from '../../types/cash';

export const CASH_MONEY_RE = /^\d+(\.\d{1,2})?$/;
export const MAX_CASH = 1_000_000; // mismo tope que el servidor

// Valida un monto de efectivo >= 0 con hasta 2 decimales (el servidor sigue siendo la autoridad)
export const cashAmountError = (value: string, label: string): string | null => {
  const v = value.trim();
  if (!v) return `${label} es obligatorio.`;
  if (!CASH_MONEY_RE.test(v)) return 'Usa un monto mayor o igual a 0 con hasta 2 decimales (ej. 500 o 500.50).';
  if (Number(v) > MAX_CASH) return `El máximo es $${MAX_CASH.toLocaleString('es-MX')}.`;
  return null;
};

export const resultMeta: Record<CashResult, { label: string; icon: LucideIcon; className: string; explain: (d: string) => string }> = {
  OVER:  { label: 'Sobrante', icon: TrendingUp,     className: 'bg-amber-50 text-amber-900 border-amber-700/40', explain: (d) => `Hay ${d} más de lo esperado.` },
  SHORT: { label: 'Faltante', icon: TrendingDown,   className: 'bg-red-50 text-red-800 border-red-700/40',       explain: (d) => `Faltan ${d} respecto a lo esperado.` },
  EVEN:  { label: 'Cuadrado', icon: CircleCheckBig, className: 'bg-green-50 text-green-900 border-green-700/40', explain: () => 'El efectivo contado coincide con lo esperado.' },
};

const dateTimeFmt = new Intl.DateTimeFormat('es-MX', { timeZone: REPORT_TZ, dateStyle: 'short', timeStyle: 'short' });
const timeFmt     = new Intl.DateTimeFormat('es-MX', { timeZone: REPORT_TZ, timeStyle: 'short' });
const dayFmt      = new Intl.DateTimeFormat('en-CA', { timeZone: REPORT_TZ, year: 'numeric', month: '2-digit', day: '2-digit' });

export const formatDateTime = (iso: string) => dateTimeFmt.format(new Date(iso));

// "17/11/26, 8:00 – 16:30" (si cierra otro día, se repite la fecha)
export const formatShiftSpan = (openedAt: string, closedAt: string | null) => {
  if (!closedAt) return `${formatDateTime(openedAt)} – abierta`;
  const sameDay = dayFmt.format(new Date(openedAt)) === dayFmt.format(new Date(closedAt));
  return `${formatDateTime(openedAt)} – ${sameDay ? timeFmt.format(new Date(closedAt)) : formatDateTime(closedAt)}`;
};
