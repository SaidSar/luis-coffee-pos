// Fechas de negocio en America/Mazatlan, como el backend de reportes.
// Se trabaja con cadenas YYYY-MM-DD y aritmética en UTC para no depender de la zona del navegador.

export const REPORT_TZ = 'America/Mazatlan';

export type PresetId = 'today' | 'yesterday' | 'thisWeek' | 'thisMonth' | 'lastMonth';

export interface DateRange { from: string; to: string }

// "Hoy" según el reloj de Mazatlán (en-CA formatea como YYYY-MM-DD)
export const todayInMazatlan = (now: Date = new Date()): string =>
  new Intl.DateTimeFormat('en-CA', { timeZone: REPORT_TZ, year: 'numeric', month: '2-digit', day: '2-digit' }).format(now);

const parse = (ymd: string) => {
  const [y, m, d] = ymd.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d));
};
const fmt = (d: Date) => d.toISOString().slice(0, 10);
const addDays = (ymd: string, days: number) => {
  const d = parse(ymd);
  d.setUTCDate(d.getUTCDate() + days);
  return fmt(d);
};

export const daysBetweenInclusive = (from: string, to: string) =>
  Math.round((parse(to).getTime() - parse(from).getTime()) / 86_400_000) + 1;

export const presetRange = (preset: PresetId, now: Date = new Date()): DateRange => {
  const today = todayInMazatlan(now);
  const t = parse(today);
  switch (preset) {
    case 'today':     return { from: today, to: today };
    case 'yesterday': { const y = addDays(today, -1); return { from: y, to: y }; }
    case 'thisWeek': {
      // Semana ISO: inicia en lunes (getUTCDay: 0 = domingo)
      const offset = (t.getUTCDay() + 6) % 7;
      return { from: addDays(today, -offset), to: today };
    }
    case 'thisMonth': return { from: `${today.slice(0, 8)}01`, to: today };
    case 'lastMonth': {
      const firstThis = new Date(Date.UTC(t.getUTCFullYear(), t.getUTCMonth(), 1));
      const lastPrev  = new Date(firstThis.getTime() - 86_400_000);
      const firstPrev = new Date(Date.UTC(lastPrev.getUTCFullYear(), lastPrev.getUTCMonth(), 1));
      return { from: fmt(firstPrev), to: fmt(lastPrev) };
    }
  }
};

export const PRESETS: { id: PresetId; label: string }[] = [
  { id: 'today',     label: 'Hoy' },
  { id: 'yesterday', label: 'Ayer' },
  { id: 'thisWeek',  label: 'Esta semana' },
  { id: 'thisMonth', label: 'Este mes' },
  { id: 'lastMonth', label: 'Mes pasado' },
];

// dd/mm/yyyy para mostrar
export const formatYmd = (ymd: string) => {
  const [y, m, d] = ymd.split('-');
  return `${d}/${m}/${y}`;
};

export const formatMonth = (ymd: string) =>
  new Intl.DateTimeFormat('es-MX', { month: 'long', year: 'numeric', timeZone: 'UTC' }).format(parse(ymd));
