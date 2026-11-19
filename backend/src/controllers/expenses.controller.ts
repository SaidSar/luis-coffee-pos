import { Request, Response } from 'express';
import { z } from 'zod';
import { Prisma } from '@prisma/client';
import { prisma } from '../lib/prisma';
import { HttpError, parse, sendError } from '../lib/http-error';
import { ymd, withRangeRules } from '../lib/dateSchemas';
import { addDays, mazatlanNoon, todayMazatlan, toMazatlanYmd } from '../lib/mazatlan';
import { inRange, local } from '../services/reports.service';
import { EXPENSE_CATEGORIES } from '../constants/expenseCategories';

const MAX_AMOUNT = 1_000_000;

// ── Schemas ──────────────────────────────────────────────────
// Monto: número o texto, > 0, máximo 2 decimales y tope de 1,000,000
export const amount = z
  .union([z.number(), z.string().trim()])
  .refine((v) => /^\d+(\.\d{1,2})?$/.test(String(v)), { message: 'Monto inválido (número con máximo 2 decimales)' })
  .transform((v) => new Prisma.Decimal(String(v)))
  .refine((d) => d.gt(0), { message: 'El monto debe ser mayor a 0' })
  .refine((d) => d.lte(MAX_AMOUNT), { message: `El monto máximo es ${MAX_AMOUNT.toLocaleString('es-MX')}` });

// Fecha del gasto (día de negocio en Mazatlán): no más de 1 día en el futuro
export const expenseDate = ymd.refine((d) => d <= addDays(todayMazatlan(), 1), { message: 'La fecha no puede ser futura' });

export const notes = z.string().trim().max(500, { message: 'Máximo 500 caracteres' })
  .transform((s) => (s === '' ? null : s))
  .nullable();

const baseSchema = z.object({
  description: z.string().trim().min(1, { message: 'La descripción es obligatoria' }).max(200, { message: 'Máximo 200 caracteres' }),
  amount,
  category:    z.enum(EXPENSE_CATEGORIES),
  date:        expenseDate,
  notes:       notes.optional(),
  // Pagado con el efectivo de la caja: se resta del efectivo esperado del turno abierto
  paidFromCash: z.boolean({ message: 'Indica sí o no' }),
});

// El default solo aplica al crear; en PATCH un campo ausente no se toca
const createSchema = baseSchema.extend({ paidFromCash: baseSchema.shape.paidFromCash.default(false) });

const updateSchema = baseSchema.partial()
  .refine((d) => Object.keys(d).length > 0, { message: 'Indica al menos un campo' });

const listSchema = withRangeRules(z.object({
  from:     ymd,
  to:       ymd,
  category: z.enum(EXPENSE_CATEGORIES).optional(),
  limit:    z.coerce.number().int().min(1).max(200).default(50),
  offset:   z.coerce.number().int().min(0).default(0),
}));

// ── Forma de respuesta ───────────────────────────────────────
const withUser = { user: { select: { id: true, name: true } } } as const;
type ExpenseWithUser = Prisma.ExpenseGetPayload<{ include: typeof withUser }>;

const toView = (e: ExpenseWithUser) => ({
  id:          e.id,
  date:        toMazatlanYmd(e.expenseDate), // mismo día local que usan los reportes
  description: e.description,
  category:    e.category,
  notes:       e.notes,
  paidFromCash: e.paidFromCash,
  amount:      Number(e.amount),
  user:        e.user,
});

// ── GET /api/expenses?from&to&category&limit&offset ─────────
export const listExpenses = async (req: Request, res: Response) => {
  try {
    const q = parse(listSchema, req.query);
    // Mismo filtro de fecha que reports.service (expenseDate en el rango de días locales)
    const where = Prisma.sql`WHERE ${inRange(Prisma.sql`e."expenseDate"`, q)}
      ${q.category ? Prisma.sql`AND e.category = ${q.category}` : Prisma.empty}`;

    const items = await prisma.$queryRaw<{
      id: string; date: string; description: string; category: string; notes: string | null;
      amount: Prisma.Decimal; paidFromCash: boolean; userId: string; userName: string;
      employeeId: string | null; employeeName: string | null;
    }[]>`
      SELECT e.id, to_char(${local(Prisma.sql`e."expenseDate"`)}, 'YYYY-MM-DD') AS date,
             e.description, e.category, e.notes, e.amount, e."paidFromCash",
             u.id AS "userId", u.name AS "userName", emp.id AS "employeeId", emp.name AS "employeeName"
        FROM "Expense" e JOIN "User" u ON u.id = e."userId"
        LEFT JOIN "User" emp ON emp.id = e."employeeId"
        ${where}
       ORDER BY e."expenseDate" DESC, e.id
       LIMIT ${q.limit} OFFSET ${q.offset}`;

    const [agg] = await prisma.$queryRaw<{ count: number; total: Prisma.Decimal }[]>`
      SELECT COUNT(*)::int AS count, COALESCE(SUM(e.amount), 0)::numeric(14,2) AS total
        FROM "Expense" e ${where}`;

    res.json({
      items: items.map((x) => ({
        id: x.id, date: x.date, description: x.description, category: x.category, notes: x.notes,
        paidFromCash: x.paidFromCash,
        amount: Number(x.amount), user: { id: x.userId, name: x.userName },
        employee: x.employeeId ? { id: x.employeeId, name: x.employeeName } : null,
      })),
      count:  agg.count,
      total:  Number(agg.total),
      limit:  q.limit,
      offset: q.offset,
    });
  } catch (err) {
    sendError(res, err, 'listExpenses');
  }
};

// ── POST /api/expenses ───────────────────────────────────────
export const createExpense = async (req: Request, res: Response) => {
  try {
    const body = parse(createSchema, req.body);
    const created = await prisma.expense.create({
      data: {
        userId:      req.user!.id, // quien registra sale del token, nunca del body
        description: body.description,
        amount:      body.amount,
        category:    body.category,
        expenseDate: mazatlanNoon(body.date),
        notes:       body.notes ?? null,
        paidFromCash: body.paidFromCash,
      },
      include: withUser,
    });
    res.status(201).json(toView(created));
  } catch (err) {
    sendError(res, err, 'createExpense');
  }
};

// ── PATCH /api/expenses/:id ──────────────────────────────────
export const updateExpense = async (req: Request, res: Response) => {
  try {
    const id   = String(req.params.id);
    const body = parse(updateSchema, req.body);
    const updated = await prisma.expense.update({
      where: { id },
      data:  {
        ...(body.description !== undefined ? { description: body.description } : {}),
        ...(body.amount      !== undefined ? { amount: body.amount } : {}),
        ...(body.category    !== undefined ? { category: body.category } : {}),
        ...(body.date        !== undefined ? { expenseDate: mazatlanNoon(body.date) } : {}),
        ...(body.notes       !== undefined ? { notes: body.notes } : {}),
        ...(body.paidFromCash !== undefined ? { paidFromCash: body.paidFromCash } : {}),
      },
      include: withUser,
    });
    res.json(toView(updated));
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2025') {
      return sendError(res, new HttpError(404, 'Gasto no encontrado'), 'updateExpense');
    }
    sendError(res, err, 'updateExpense');
  }
};

// ── DELETE /api/expenses/:id ─────────────────────────────────
export const deleteExpense = async (req: Request, res: Response) => {
  try {
    const id = String(req.params.id);
    const { count } = await prisma.expense.deleteMany({ where: { id } });
    if (count === 0) throw new HttpError(404, 'Gasto no encontrado');
    res.status(204).end();
  } catch (err) {
    sendError(res, err, 'deleteExpense');
  }
};
