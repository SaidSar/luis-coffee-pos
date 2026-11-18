import { Request, Response } from 'express';
import { z } from 'zod';
import { PaymentMethod, Prisma } from '@prisma/client';
import { prisma } from '../lib/prisma';
import { HttpError, parse, sendError } from '../lib/http-error';
import { ymd, withRangeRules } from '../lib/dateSchemas';
import { addDays, mazatlanDayStart } from '../lib/mazatlan';
import { emit } from '../services/socket.service';
import { TX_OPTS } from './orders.helpers';

const MAX_CASH = 1_000_000;
const ACTIVE_ORDER = ['OPEN', 'IN_KITCHEN', 'SERVED'] as const;
// Candado de transacción que serializa abrir/cerrar caja (garantiza un único turno abierto)
const CASH_LOCK = Prisma.sql`SELECT pg_advisory_xact_lock(hashtext('lcb:cash-shift'))`;

// ── Schemas ──────────────────────────────────────────────────
// Monto de efectivo: número o texto, >= 0, máximo 2 decimales y tope de 1,000,000
const cash = (label: string) => z
  .union([z.number(), z.string().trim()], { message: `${label} es obligatorio` })
  .refine((v) => /^\d+(\.\d{1,2})?$/.test(String(v)), { message: `${label}: número mayor o igual a 0 con máximo 2 decimales` })
  .transform((v) => new Prisma.Decimal(String(v)))
  .refine((d) => d.lte(MAX_CASH), { message: `${label}: máximo ${MAX_CASH.toLocaleString('es-MX')}` });

const openSchema  = z.object({ openingFloat: cash('El fondo inicial') });
const closeSchema = z.object({
  countedCash: cash('El efectivo contado'),
  notes:       z.string().trim().max(500, { message: 'Máximo 500 caracteres' }).optional()
    .transform((s) => (s ? s : null)),
});
const shiftsSchema = withRangeRules(z.object({ from: ymd, to: ymd }));

// ── Cálculos ─────────────────────────────────────────────────
const ZERO = new Prisma.Decimal(0);
const fx = (d: Prisma.Decimal | null | undefined) => (d ?? ZERO).toFixed(2);
type Db = Prisma.TransactionClient | typeof prisma;

// Ventas por método y gastos pagados de caja en la ventana [desde, hasta).
// Los pagos guardan el total cobrado (no lo recibido): el cambio entregado no cuenta como efectivo en caja.
const shiftTotals = async (db: Db, from: Date, to: Date) => {
  const [byMethod, exp] = await Promise.all([
    db.payment.groupBy({
      by: ['method'],
      where: { paidAt: { gte: from, lt: to } },
      _sum: { amount: true },
      _count: { _all: true },
    }),
    db.expense.aggregate({
      where: { paidFromCash: true, createdAt: { gte: from, lt: to } },
      _sum: { amount: true },
      _count: { _all: true },
    }),
  ]);
  const sum = (m: PaymentMethod) => byMethod.find((r) => r.method === m)?._sum.amount ?? ZERO;
  const cashSales = sum('CASH');
  const total = cashSales.add(sum('CARD')).add(sum('TRANSFER'));
  return {
    cashSales,
    cashExpenses: exp._sum.amount ?? ZERO,
    view: {
      sales: {
        CASH: fx(cashSales), CARD: fx(sum('CARD')), TRANSFER: fx(sum('TRANSFER')), total: fx(total),
        count: byMethod.reduce((n, r) => n + r._count._all, 0),
      },
      cashExpenses: { total: fx(exp._sum.amount), count: exp._count._all },
    },
  };
};

const pendingOrders = (db: Db) => db.order.count({ where: { status: { in: [...ACTIVE_ORDER] } } });

const withUsers = {
  openedBy: { select: { id: true, name: true } },
  closedBy: { select: { id: true, name: true } },
} as const;
type ShiftWithUsers = Prisma.CashShiftGetPayload<{ include: typeof withUsers }>;

const shiftView = (s: ShiftWithUsers, showExpected: boolean) => ({
  id:           s.id,
  openedAt:     s.openedAt,
  openedBy:     s.openedBy,
  openingFloat: fx(s.openingFloat),
  closedAt:     s.closedAt,
  closedBy:     s.closedBy,
  countedCash:  s.countedCash ? fx(s.countedCash) : null,
  // Cierre ciego: el esperado se oculta al cajero hasta que entrega su conteo
  ...(showExpected ? { expectedCash: s.expectedCash ? fx(s.expectedCash) : null } : {}),
  difference:   s.difference ? fx(s.difference) : null,
  notes:        s.notes,
});

const resultOf = (diff: Prisma.Decimal) => (diff.isZero() ? 'EVEN' : diff.gt(0) ? 'OVER' : 'SHORT');

// ── GET /api/cash/status ─────────────────────────────────────
// Solo si hay un turno abierto (sin montos): lo usan el POS y el encabezado, también para meseros
export const getStatus = async (_req: Request, res: Response) => {
  try {
    const open = await prisma.cashShift.findFirst({ where: { closedAt: null }, select: { openedAt: true } });
    res.json({ open: !!open, openedAt: open?.openedAt ?? null });
  } catch (err) {
    sendError(res, err, 'getCashStatus');
  }
};

// ── GET /api/cash/current ────────────────────────────────────
export const getCurrent = async (req: Request, res: Response) => {
  try {
    const shift = await prisma.cashShift.findFirst({ where: { closedAt: null }, include: withUsers });
    if (!shift) return res.json({ open: false, pendingOrders: await pendingOrders(prisma) });

    const isAdmin = req.user!.role === 'ADMIN';
    // +1 ms: la ventana es [apertura, ahora] inclusiva para la vista en vivo
    const until = new Date(Date.now() + 1);
    const [t, pending] = await Promise.all([shiftTotals(prisma, shift.openedAt, until), pendingOrders(prisma)]);
    const expected = shift.openingFloat.add(t.cashSales).sub(t.cashExpenses);
    res.json({
      open: true,
      shift: shiftView(shift, false),
      ...t.view,
      pendingOrders: pending,
      // Solo ADMIN ve el efectivo esperado antes del cierre
      ...(isAdmin ? { expectedCash: fx(expected) } : {}),
    });
  } catch (err) {
    sendError(res, err, 'getCurrentCash');
  }
};

// ── POST /api/cash/open ──────────────────────────────────────
export const openShift = async (req: Request, res: Response) => {
  try {
    const body = parse(openSchema, req.body);
    const shift = await prisma.$transaction(async (tx) => {
      await tx.$executeRaw(CASH_LOCK);
      const open = await tx.cashShift.findFirst({ where: { closedAt: null }, select: { id: true } });
      if (open) throw new HttpError(409, 'Ya hay una caja abierta');
      return tx.cashShift.create({
        data: { openedById: req.user!.id, openingFloat: body.openingFloat },
        include: withUsers,
      });
    }, TX_OPTS);
    emit('cash:updated', { open: true, shiftId: shift.id });
    res.status(201).json({ shift: shiftView(shift, false) });
  } catch (err) {
    sendError(res, err, 'openShift');
  }
};

// ── POST /api/cash/close ─────────────────────────────────────
export const closeShift = async (req: Request, res: Response) => {
  try {
    const body = parse(closeSchema, req.body);
    const out = await prisma.$transaction(async (tx) => {
      await tx.$executeRaw(CASH_LOCK);
      const open = await tx.cashShift.findFirst({ where: { closedAt: null } });
      if (!open) throw new HttpError(409, 'No hay una caja abierta');

      const closedAt = new Date();
      const t = await shiftTotals(tx, open.openedAt, closedAt);
      // Esperado = fondo + ventas en efectivo del turno − gastos pagados de caja del turno (se congela)
      const expectedCash = open.openingFloat.add(t.cashSales).sub(t.cashExpenses);
      const difference   = body.countedCash.sub(expectedCash);
      const shift = await tx.cashShift.update({
        where: { id: open.id },
        data:  { closedAt, closedById: req.user!.id, countedCash: body.countedCash, expectedCash, difference, notes: body.notes },
        include: withUsers,
      });
      return { shift, t, difference, pending: await pendingOrders(tx) };
    }, TX_OPTS);

    emit('cash:updated', { open: false, shiftId: out.shift.id });
    // Tras entregar el conteo, el resultado completo se muestra también al cajero
    res.json({
      shift: shiftView(out.shift, true),
      ...out.t.view,
      result: resultOf(out.difference),
      pendingOrders: out.pending,
      ...(out.pending > 0 ? { warning: out.pending === 1 ? 'Quedó 1 orden sin cobrar al cerrar la caja' : `Quedaron ${out.pending} órdenes sin cobrar al cerrar la caja` } : {}),
    });
  } catch (err) {
    sendError(res, err, 'closeShift');
  }
};

// ── GET /api/cash/shifts?from&to (ADMIN) ─────────────────────
// Turnos abiertos en el rango de días (hora de Mazatlán), del más reciente al más antiguo
export const listShifts = async (req: Request, res: Response) => {
  try {
    const q = parse(shiftsSchema, req.query);
    const shifts = await prisma.cashShift.findMany({
      where:   { openedAt: { gte: mazatlanDayStart(q.from), lt: mazatlanDayStart(addDays(q.to, 1)) } },
      include: withUsers,
      orderBy: { openedAt: 'desc' },
      take:    200,
    });
    res.json({ items: shifts.map((s) => ({ ...shiftView(s, true), result: s.difference ? resultOf(s.difference) : null })) });
  } catch (err) {
    sendError(res, err, 'listShifts');
  }
};
