import { Request, Response } from 'express';
import { z } from 'zod';
import { Prisma } from '@prisma/client';
import { prisma } from '../lib/prisma';
import { HttpError, parse, sendError } from '../lib/http-error';
import { ymd, withRangeRules } from '../lib/dateSchemas';
import { addDays, mazatlanDayStart, mazatlanNoon, toMazatlanYmd } from '../lib/mazatlan';
import { generateTemporaryPassword, hashPassword, publicUser } from '../lib/password';
import { invalidateSession } from '../services/session.service';
import { disconnectUser } from '../services/socket.service';
import { amount, expenseDate, notes } from './expenses.controller';
import { TX_OPTS } from './orders.helpers';

// Empleados (solo ADMIN). Nada se borra: se activa o desactiva. Nunca se devuelve passwordHash ni tokenVersion.

type Tx = Prisma.TransactionClient;
const ROLES = ['ADMIN', 'CASHIER', 'WAITER'] as const;

// ── Schemas ──────────────────────────────────────────────────
const name  = z.string().trim().min(1, { message: 'El nombre es obligatorio' }).max(80, { message: 'Máximo 80 caracteres' });
const email = z.string().trim().toLowerCase().max(200, { message: 'Máximo 200 caracteres' }).pipe(z.email({ message: 'Correo inválido' }));
const role  = z.enum(ROLES, { message: 'Rol inválido' });

const createSchema = z.object({ name, email, role });
const updateSchema = z.object({ name, email, role }).partial()
  .refine((d) => Object.keys(d).length > 0, { message: 'Indica al menos un campo' });

// Periodo opcional; si se manda, con las mismas reglas que los reportes
const periodSchema = z.object({ from: ymd.optional(), to: ymd.optional() })
  .refine((q) => (q.from === undefined) === (q.to === undefined), { message: 'Indica from y to juntos', path: ['from'] })
  .pipe(z.union([withRangeRules(z.object({ from: ymd, to: ymd })), z.object({ from: z.undefined(), to: z.undefined() })]));

const listSchema = z.object({
  search: z.string().trim().max(80).optional(),
  role:   role.optional(),
  active: z.enum(['true', 'false']).optional(),
  from:   ymd.optional(),
  to:     ymd.optional(),
});

const payrollSchema = z.object({
  amount,
  date:         expenseDate,
  notes:        notes.optional(),
  paidFromCash: z.boolean({ message: 'Indica sí o no' }).default(false),
});

// ── Estadísticas del periodo (una consulta para todos los usuarios pedidos) ──
interface Stats { ordersTaken: number; tickets: number; sales: number; averageTicket: number; deliveries: number; payroll: number; shiftsClosed: number }
const money = (v: Prisma.Decimal | number | null) => Math.round(Number(v ?? 0) * 100) / 100;

const statsFor = async (ids: string[], period?: { from: string; to: string }): Promise<Map<string, Stats>> => {
  if (ids.length === 0) return new Map();
  const start = period ? mazatlanDayStart(period.from) : new Date(0);
  const end   = period ? mazatlanDayStart(addDays(period.to, 1)) : new Date('9999-01-01T00:00:00Z');
  const rows = await prisma.$queryRaw<{ id: string; ordersTaken: number; tickets: number; sales: Prisma.Decimal; deliveries: number; payroll: Prisma.Decimal; shiftsClosed: number }[]>`
    SELECT u.id,
           (SELECT COUNT(*) FROM "Order" o WHERE o."userId" = u.id AND o."createdAt" >= ${start} AND o."createdAt" < ${end})::int AS "ordersTaken",
           (SELECT COUNT(*) FROM "Order" o WHERE o."userId" = u.id AND o.status = 'PAID' AND o."paidAt" >= ${start} AND o."paidAt" < ${end})::int AS tickets,
           (SELECT COALESCE(SUM(p.amount), 0) FROM "Order" o JOIN "Payment" p ON p."orderId" = o.id
             WHERE o."userId" = u.id AND o.status = 'PAID' AND o."paidAt" >= ${start} AND o."paidAt" < ${end}) AS sales,
           -- Entregas: órdenes a domicilio que tomó el empleado
           (SELECT COUNT(*) FROM "Order" o JOIN "Delivery" d ON d."orderId" = o.id
             WHERE o."userId" = u.id AND d."createdAt" >= ${start} AND d."createdAt" < ${end})::int AS deliveries,
           (SELECT COALESCE(SUM(e.amount), 0) FROM "Expense" e
             WHERE e."employeeId" = u.id AND e.category = 'NOMINA' AND e."expenseDate" >= ${start} AND e."expenseDate" < ${end}) AS payroll,
           (SELECT COUNT(*) FROM "CashShift" s WHERE s."closedById" = u.id AND s."closedAt" >= ${start} AND s."closedAt" < ${end})::int AS "shiftsClosed"
      FROM "User" u WHERE u.id IN (${Prisma.join(ids)})`;
  return new Map(rows.map((r) => {
    const sales = money(r.sales);
    return [r.id, { ordersTaken: r.ordersTaken, tickets: r.tickets, sales, averageTicket: r.tickets ? money(sales / r.tickets) : 0,
      deliveries: r.deliveries, payroll: money(r.payroll), shiftsClosed: r.shiftsClosed }];
  }));
};

// ── Guardas ──────────────────────────────────────────────────
const assertEmailFree = async (tx: Tx, mail: string, exceptId?: string) => {
  const dup = await tx.user.findFirst({ where: { email: { equals: mail, mode: 'insensitive' }, ...(exceptId ? { NOT: { id: exceptId } } : {}) }, select: { id: true } });
  if (dup) throw new HttpError(409, 'Ya existe un empleado con ese correo', { code: 'EMAIL_TAKEN' });
};

// Al quitarle el rol ADMIN o desactivarlo, debe quedar al menos otro ADMIN activo
const assertNotLastAdmin = async (tx: Tx, userId: string) => {
  const others = await tx.user.count({ where: { role: 'ADMIN', active: true, NOT: { id: userId } } });
  if (others === 0) throw new HttpError(409, 'Debe quedar al menos un administrador activo', { code: 'LAST_ADMIN' });
};

// Candado que serializa los cambios de rol/estado (evita que dos ADMIN se degraden a la vez)
const lockUsers = (tx: Tx) => tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext('lcb:users'))`;

const findOr404 = async (tx: Tx, id: string) => {
  const u = await tx.user.findUnique({ where: { id } });
  if (!u) throw new HttpError(404, 'Empleado no encontrado');
  return u;
};

// Tras el commit: la sesión cambia al instante y se cierran sus sockets
const endSessions = (userId: string) => { invalidateSession(userId); disconnectUser(userId); };

// ── GET /api/employees?search&role&active&from&to ────────────
export const listEmployees = async (req: Request, res: Response) => {
  try {
    const q = parse(listSchema, req.query);
    const period = parse(periodSchema, { from: q.from, to: q.to });
    const users = await prisma.user.findMany({
      where: {
        ...(q.search ? { OR: [{ name: { contains: q.search, mode: 'insensitive' } }, { email: { contains: q.search, mode: 'insensitive' } }] } : {}),
        ...(q.role ? { role: q.role } : {}),
        ...(q.active ? { active: q.active === 'true' } : {}),
      },
      select: publicUser,
      orderBy: [{ active: 'desc' }, { name: 'asc' }],
      take: 200,
    });
    const stats = await statsFor(users.map((u) => u.id), period.from ? period as { from: string; to: string } : undefined);
    res.json({ items: users.map((u) => ({ ...u, stats: stats.get(u.id) })), period: period.from ? period : null });
  } catch (err) {
    sendError(res, err, 'listEmployees');
  }
};

// ── GET /api/employees/:id?from&to ───────────────────────────
export const getEmployee = async (req: Request, res: Response) => {
  try {
    const id = String(req.params.id);
    const period = parse(periodSchema, { from: req.query.from, to: req.query.to });
    const user = await prisma.user.findUnique({ where: { id }, select: publicUser });
    if (!user) throw new HttpError(404, 'Empleado no encontrado');
    const p = period.from ? period as { from: string; to: string } : undefined;
    const [stats, payroll] = await Promise.all([
      statsFor([id], p),
      prisma.expense.findMany({
        where: { employeeId: id, category: 'NOMINA', ...(p ? { expenseDate: { gte: mazatlanDayStart(p.from), lt: mazatlanDayStart(addDays(p.to, 1)) } } : {}) },
        orderBy: { expenseDate: 'desc' },
        select: { id: true, amount: true, expenseDate: true, notes: true, paidFromCash: true, user: { select: { id: true, name: true } } },
      }),
    ]);
    res.json({
      ...user,
      stats: stats.get(id),
      payroll: payroll.map((e) => ({ id: e.id, amount: money(e.amount), date: toMazatlanYmd(e.expenseDate), notes: e.notes, paidFromCash: e.paidFromCash, registeredBy: e.user })),
      period: p ?? null,
    });
  } catch (err) {
    sendError(res, err, 'getEmployee');
  }
};

// ── POST /api/employees ──────────────────────────────────────
// Genera una contraseña temporal y la devuelve UNA sola vez (se guarda solo el hash)
export const createEmployee = async (req: Request, res: Response) => {
  try {
    const body = parse(createSchema, req.body);
    const temporaryPassword = generateTemporaryPassword();
    const passwordHash = await hashPassword(temporaryPassword);
    const user = await prisma.$transaction(async (tx) => {
      await lockUsers(tx);
      await assertEmailFree(tx, body.email);
      return tx.user.create({ data: { ...body, passwordHash, mustChangePassword: true }, select: publicUser });
    }, TX_OPTS);
    res.status(201).json({ employee: user, temporaryPassword });
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
      return sendError(res, new HttpError(409, 'Ya existe un empleado con ese correo', { code: 'EMAIL_TAKEN' }), 'createEmployee');
    }
    sendError(res, err, 'createEmployee');
  }
};

// ── PATCH /api/employees/:id ─────────────────────────────────
// Cambiar el rol sube tokenVersion: la sesión del empleado se invalida y sus sockets se cierran.
export const updateEmployee = async (req: Request, res: Response) => {
  try {
    const id = String(req.params.id);
    const body = parse(updateSchema, req.body);
    const { user, roleChanged } = await prisma.$transaction(async (tx) => {
      await lockUsers(tx);
      const cur = await findOr404(tx, id);
      const roleChanged = body.role !== undefined && body.role !== cur.role;
      if (roleChanged && id === req.user!.id) throw new HttpError(409, 'No puedes cambiar tu propio rol', { code: 'SELF_ACTION' });
      if (roleChanged && cur.role === 'ADMIN' && cur.active) await assertNotLastAdmin(tx, id);
      if (body.email && body.email !== cur.email.toLowerCase()) await assertEmailFree(tx, body.email, id);
      const user = await tx.user.update({
        where: { id },
        data:  { ...body, ...(roleChanged ? { tokenVersion: { increment: 1 } } : {}) },
        select: publicUser,
      });
      return { user, roleChanged };
    }, TX_OPTS);
    if (roleChanged) endSessions(id); else invalidateSession(id);
    res.json(user);
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
      return sendError(res, new HttpError(409, 'Ya existe un empleado con ese correo', { code: 'EMAIL_TAKEN' }), 'updateEmployee');
    }
    sendError(res, err, 'updateEmployee');
  }
};

// ── POST /api/employees/:id/deactivate ───────────────────────
export const deactivateEmployee = async (req: Request, res: Response) => {
  try {
    const id = String(req.params.id);
    const user = await prisma.$transaction(async (tx) => {
      await lockUsers(tx);
      const cur = await findOr404(tx, id);
      if (id === req.user!.id) throw new HttpError(409, 'No puedes desactivarte a ti mismo', { code: 'SELF_ACTION' });
      if (!cur.active) throw new HttpError(409, 'El empleado ya está inactivo');
      if (cur.role === 'ADMIN') await assertNotLastAdmin(tx, id);
      const shift = await tx.cashShift.findFirst({ where: { openedById: id, closedAt: null }, select: { id: true } });
      if (shift) throw new HttpError(409, 'Tiene un turno de caja abierto: ciérralo antes de desactivarlo', { code: 'OPEN_SHIFT' });
      return tx.user.update({ where: { id }, data: { active: false, tokenVersion: { increment: 1 } }, select: publicUser });
    }, TX_OPTS);
    endSessions(id);
    res.json(user);
  } catch (err) {
    sendError(res, err, 'deactivateEmployee');
  }
};

// ── POST /api/employees/:id/activate ─────────────────────────
export const activateEmployee = async (req: Request, res: Response) => {
  try {
    const id = String(req.params.id);
    const user = await prisma.$transaction(async (tx) => {
      const cur = await findOr404(tx, id);
      if (cur.active) throw new HttpError(409, 'El empleado ya está activo');
      return tx.user.update({ where: { id }, data: { active: true }, select: publicUser });
    }, TX_OPTS);
    invalidateSession(id);
    res.json(user);
  } catch (err) {
    sendError(res, err, 'activateEmployee');
  }
};

// ── POST /api/employees/:id/reset-password ───────────────────
// Nueva contraseña temporal (devuelta una vez), cambio obligatorio y cierre de todas sus sesiones
export const resetPassword = async (req: Request, res: Response) => {
  try {
    const id = String(req.params.id);
    if (id === req.user!.id) throw new HttpError(409, 'Para tu propia cuenta usa "Cambiar contraseña"', { code: 'SELF_ACTION' });
    const temporaryPassword = generateTemporaryPassword();
    const passwordHash = await hashPassword(temporaryPassword);
    const user = await prisma.$transaction(async (tx) => {
      await findOr404(tx, id);
      return tx.user.update({ where: { id }, data: { passwordHash, mustChangePassword: true, tokenVersion: { increment: 1 } }, select: publicUser });
    }, TX_OPTS);
    endSessions(id);
    res.json({ employee: user, temporaryPassword });
  } catch (err) {
    sendError(res, err, 'resetPassword');
  }
};

// ── POST /api/employees/:id/payroll ──────────────────────────
// Gasto de categoría NOMINA ligado al empleado: aparece en Gastos y baja la utilidad
export const registerPayroll = async (req: Request, res: Response) => {
  try {
    const id = String(req.params.id);
    const body = parse(payrollSchema, req.body);
    const emp = await prisma.user.findUnique({ where: { id }, select: { id: true, name: true } });
    if (!emp) throw new HttpError(404, 'Empleado no encontrado');
    const e = await prisma.expense.create({
      data: {
        userId:       req.user!.id, // quien registra sale del token
        employeeId:   emp.id,
        description:  `Nómina — ${emp.name}`,
        amount:       body.amount,
        category:     'NOMINA',
        expenseDate:  mazatlanNoon(body.date),
        notes:        body.notes ?? null,
        paidFromCash: body.paidFromCash,
      },
    });
    res.status(201).json({
      id: e.id, amount: money(e.amount), date: toMazatlanYmd(e.expenseDate), description: e.description,
      notes: e.notes, paidFromCash: e.paidFromCash, employeeId: emp.id,
    });
  } catch (err) {
    sendError(res, err, 'registerPayroll');
  }
};
