// Fechas de negocio en America/Mazatlan (misma zona que los reportes).
export const BUSINESS_TZ = 'America/Mazatlan';

const ymdFmt = new Intl.DateTimeFormat('en-CA', { timeZone: BUSINESS_TZ, year: 'numeric', month: '2-digit', day: '2-digit' });

// Instante → YYYY-MM-DD en hora de Mazatlán
export const toMazatlanYmd = (d: Date): string => ymdFmt.format(d);

export const todayMazatlan = (): string => toMazatlanYmd(new Date());

export const addDays = (ymd: string, days: number): string => {
  const [y, m, d] = ymd.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d + days)).toISOString().slice(0, 10);
};

// Desfase de Mazatlán respecto a UTC (en minutos) en un instante dado, p. ej. -420
const offsetMinutes = (at: Date): number => {
  const part = new Intl.DateTimeFormat('en-US', { timeZone: BUSINESS_TZ, timeZoneName: 'longOffset' })
    .formatToParts(at).find((p) => p.type === 'timeZoneName')?.value ?? 'GMT';
  const m = part.match(/GMT([+-])(\d{2}):(\d{2})/);
  return m ? (m[1] === '-' ? -1 : 1) * (Number(m[2]) * 60 + Number(m[3])) : 0;
};

// Día YYYY-MM-DD → instante de las 00:00 de ese día en Mazatlán (para rangos [inicio de from, inicio de to+1))
export const mazatlanDayStart = (ymd: string): Date => {
  const [y, m, d] = ymd.split('-').map(Number);
  const guess = new Date(Date.UTC(y, m - 1, d));
  return new Date(guess.getTime() - offsetMinutes(guess) * 60_000);
};

// Día YYYY-MM-DD → instante del mediodía de ese día en Mazatlán. Se guarda a mediodía para que el gasto
// quede dentro del día local sin ambigüedad y lo encuentren los filtros de reportes (rango por día local).
export const mazatlanNoon = (ymd: string): Date => {
  const [y, m, d] = ymd.split('-').map(Number);
  const guess = new Date(Date.UTC(y, m - 1, d, 12));
  return new Date(guess.getTime() - offsetMinutes(guess) * 60_000);
};
