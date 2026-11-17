import { z } from 'zod';

// Validaciones de fecha compartidas por reportes y gastos (fechas de negocio YYYY-MM-DD en America/Mazatlan)
export const MAX_RANGE_DAYS = 366;

// YYYY-MM-DD que además sea una fecha real del calendario (rechaza 2026-02-30)
export const ymd = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, { message: 'Formato de fecha YYYY-MM-DD' })
  .refine((s) => {
    const [y, m, d] = s.split('-').map(Number);
    const dt = new Date(Date.UTC(y, m - 1, d));
    return dt.getUTCFullYear() === y && dt.getUTCMonth() === m - 1 && dt.getUTCDate() === d;
  }, { message: 'Fecha inválida' });

export const dayNumber = (s: string) => {
  const [y, m, d] = s.split('-').map(Number);
  return Date.UTC(y, m - 1, d) / 86_400_000;
};

// Rango from–to (to inclusivo) con from <= to y como máximo MAX_RANGE_DAYS días
export const withRangeRules = <T extends z.ZodType<{ from: string; to: string }>>(schema: T) =>
  schema
    .refine((q) => q.from <= q.to, { message: 'from debe ser menor o igual que to', path: ['from'] })
    .refine((q) => dayNumber(q.to) - dayNumber(q.from) + 1 <= MAX_RANGE_DAYS, {
      message: `El rango máximo es de ${MAX_RANGE_DAYS} días`, path: ['to'],
    });
