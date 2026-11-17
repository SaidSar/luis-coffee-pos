import { Request, Response } from 'express';
import { z } from 'zod';
import { parse, sendError } from '../lib/http-error';
import * as reports from '../services/reports.service';
import { buildReportWorkbook } from '../services/excel.service';
import { ymd, withRangeRules } from '../lib/dateSchemas';

// from y to se interpretan en America/Mazatlan; "to" es inclusivo (máximo 366 días)
const querySchema = withRangeRules(z.object({
  from:    ymd,
  to:      ymd,
  groupBy: z.enum(['day', 'week', 'month']).default('day'),
}));

const range = (req: Request) => parse(querySchema, req.query);

// Envuelve un reporte JSON con validación y manejo de errores uniforme
const jsonReport = <T>(tag: string, fn: (q: z.infer<typeof querySchema>) => Promise<T>) =>
  async (req: Request, res: Response) => {
    try {
      res.json(await fn(range(req)));
    } catch (err) {
      sendError(res, err, tag);
    }
  };

export const getSummary        = jsonReport('reports.summary',  (q) => reports.summary(q));
export const getSales          = jsonReport('reports.sales',    (q) => reports.salesByPeriod(q, q.groupBy));
export const getProducts       = jsonReport('reports.products', (q) => reports.byProduct(q));
export const getCategories     = jsonReport('reports.categories', (q) => reports.byCategory(q));
export const getPaymentMethods = jsonReport('reports.payments', (q) => reports.byPaymentMethod(q));
export const getEmployees      = jsonReport('reports.employees', (q) => reports.byEmployee(q));

// ── GET /api/reports/export → .xlsx con el libro completo ──
export const exportExcel = async (req: Request, res: Response) => {
  try {
    const q = range(req);
    // Secuencial a propósito: el pooler limita conexiones y cada consulta ya es agregada
    const summary    = await reports.summary(q);
    const sales      = await reports.salesByPeriod(q, q.groupBy);
    const products   = await reports.byProduct(q);
    const categories = await reports.byCategory(q);
    const payments   = await reports.byPaymentMethod(q);
    const employees  = await reports.byEmployee(q);
    const expenses   = await reports.expenses(q);
    const inventory  = await reports.inventory();

    const wb = buildReportWorkbook({ summary, groupBy: q.groupBy, sales, products, categories, payments, employees, expenses, inventory });
    const filename = `luis-coffee-break_contabilidad_${q.from}_${q.to}.xlsx`;

    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.setHeader('Cache-Control', 'no-store');
    await wb.xlsx.write(res);
    res.end();
  } catch (err) {
    // Si ya se empezó a escribir el archivo no se puede cambiar el status: se corta la respuesta
    if (res.headersSent) {
      console.error('[reports.export] error tras enviar cabeceras:', err);
      res.destroy();
      return;
    }
    sendError(res, err, 'reports.export');
  }
};
