import { Prisma, Role } from '@prisma/client';
import { prisma } from '../lib/prisma';
import { addDays, mazatlanDayStart, todayMazatlan } from '../lib/mazatlan';
import { local } from './reports.service';

// Resumen del día (hora de Mazatlán) para el dashboard. Mismas reglas que los reportes:
// venta = orden PAID por Order.paidAt, importe = suma de sus Payment.amount, tickets = órdenes distintas.
// Cada bloque solo se consulta si el rol lo puede ver (los campos ausentes no viajan al cliente).

const n = (v: Prisma.Decimal | number | bigint | null | undefined) => (v == null ? 0 : Number(v));
const money = (v: Prisma.Decimal | number | null | undefined) => Math.round(n(v) * 100) / 100;

export const lowStockThreshold = () => {
  const v = Number.parseInt(process.env.LOW_STOCK_THRESHOLD ?? '', 10);
  return Number.isFinite(v) && v >= 0 ? v : 5;
};

// ── Bloques ──────────────────────────────────────────────────

// Ventas de hoy y de ayer hasta la misma hora, en una sola pasada (FILTER)
const salesSummary = async (todayStart: Date, tomorrowStart: Date, yStart: Date, yEnd: Date) => {
  const [r] = await prisma.$queryRaw<{
    sales: Prisma.Decimal; tickets: number; cost: Prisma.Decimal; ySales: Prisma.Decimal; yTickets: number;
  }[]>`
    WITH paid AS (
      SELECT o.id, o."paidAt",
             (SELECT COALESCE(SUM(p.amount), 0) FROM "Payment" p WHERE p."orderId" = o.id) AS amount,
             (SELECT COALESCE(SUM(i.quantity * i."unitCost"), 0) FROM "OrderItem" i WHERE i."orderId" = o.id) AS cost
        FROM "Order" o
       WHERE o.status = 'PAID' AND o."paidAt" >= ${yStart} AND o."paidAt" < ${tomorrowStart}
    )
    SELECT COALESCE(SUM(amount) FILTER (WHERE "paidAt" >= ${todayStart}), 0)::numeric(14,2)                 AS sales,
           COUNT(*) FILTER (WHERE "paidAt" >= ${todayStart})::int                                           AS tickets,
           COALESCE(SUM(cost) FILTER (WHERE "paidAt" >= ${todayStart}), 0)::numeric(14,2)                   AS cost,
           COALESCE(SUM(amount) FILTER (WHERE "paidAt" >= ${yStart} AND "paidAt" < ${yEnd}), 0)::numeric(14,2) AS "ySales",
           COUNT(*) FILTER (WHERE "paidAt" >= ${yStart} AND "paidAt" < ${yEnd})::int                        AS "yTickets"
      FROM paid`;
  return r;
};

// 24 cubos por hora local de hoy
const salesByHour = async (todayStart: Date, tomorrowStart: Date) => {
  const rows = await prisma.$queryRaw<{ hour: number; sales: Prisma.Decimal; tickets: number }[]>`
    WITH paid AS (
      SELECT o.id, o."paidAt", (SELECT COALESCE(SUM(p.amount), 0) FROM "Payment" p WHERE p."orderId" = o.id) AS amount
        FROM "Order" o
       WHERE o.status = 'PAID' AND o."paidAt" >= ${todayStart} AND o."paidAt" < ${tomorrowStart}
    )
    SELECT h.hour::int AS hour, COALESCE(SUM(paid.amount), 0)::numeric(14,2) AS sales, COUNT(paid.id)::int AS tickets
      FROM generate_series(0, 23) AS h(hour)
      LEFT JOIN paid ON EXTRACT(HOUR FROM ${local(Prisma.sql`paid."paidAt"`)})::int = h.hour
     GROUP BY h.hour ORDER BY h.hour`;
  return rows.map((x) => ({ hour: x.hour, sales: money(x.sales), tickets: x.tickets }));
};

const topProducts = async (todayStart: Date, tomorrowStart: Date) => {
  const rows = await prisma.$queryRaw<{ productId: string; name: string; quantity: number; sales: Prisma.Decimal }[]>`
    SELECT pr.id AS "productId", pr.name, SUM(i.quantity)::int AS quantity, SUM(i.quantity * i."unitPrice")::numeric(14,2) AS sales
      FROM "Order" o
      JOIN "OrderItem" i ON i."orderId" = o.id
      JOIN "Product" pr ON pr.id = i."productId"
     WHERE o.status = 'PAID' AND o."paidAt" >= ${todayStart} AND o."paidAt" < ${tomorrowStart}
     GROUP BY pr.id, pr.name
     ORDER BY quantity DESC, sales DESC, pr.name
     LIMIT 5`;
  return rows.map((x) => ({ ...x, sales: money(x.sales) }));
};

const byMethod = async (todayStart: Date, tomorrowStart: Date) => {
  const rows = await prisma.$queryRaw<{ method: 'CASH' | 'CARD' | 'TRANSFER'; sales: Prisma.Decimal; tickets: number }[]>`
    SELECT p.method::text AS method, SUM(p.amount)::numeric(14,2) AS sales, COUNT(DISTINCT o.id)::int AS tickets
      FROM "Order" o JOIN "Payment" p ON p."orderId" = o.id
     WHERE o.status = 'PAID' AND o."paidAt" >= ${todayStart} AND o."paidAt" < ${tomorrowStart}
     GROUP BY p.method ORDER BY sales DESC`;
  return rows.map((x) => ({ ...x, sales: money(x.sales) }));
};

// Gastos de hoy: misma regla que los reportes (fecha del gasto = día local de expenseDate)
const expensesToday = async (todayStart: Date, tomorrowStart: Date) => {
  const agg = await prisma.expense.aggregate({ where: { expenseDate: { gte: todayStart, lt: tomorrowStart } }, _sum: { amount: true } });
  return money(agg._sum.amount);
};

const last7Days = async (today: string) => {
  const from = addDays(today, -6);
  const rows = await prisma.$queryRaw<{ date: string; sales: Prisma.Decimal; tickets: number }[]>`
    WITH paid AS (
      SELECT o.id, (${local(Prisma.sql`o."paidAt"`)})::date AS day,
             (SELECT COALESCE(SUM(p.amount), 0) FROM "Payment" p WHERE p."orderId" = o.id) AS amount
        FROM "Order" o
       WHERE o.status = 'PAID' AND o."paidAt" >= ${mazatlanDayStart(from)} AND o."paidAt" < ${mazatlanDayStart(addDays(today, 1))}
    )
    SELECT to_char(d.day, 'YYYY-MM-DD') AS date, COALESCE(SUM(paid.amount), 0)::numeric(14,2) AS sales, COUNT(paid.id)::int AS tickets
      FROM generate_series(${from}::date, ${today}::date, '1 day') AS d(day)
      LEFT JOIN paid ON paid.day = d.day
     GROUP BY d.day ORDER BY d.day`;
  return rows.map((x) => ({ date: x.date, sales: money(x.sales), tickets: x.tickets }));
};

// ── Operación (todos los roles) ──────────────────────────────

// Mesas: un grupo unido cuenta como una sola (solo se cuentan las que no son secundarias)
const tables = async () => {
  const [r] = await prisma.$queryRaw<{ total: number; occupied: number }[]>`
    SELECT COUNT(*)::int AS total, COUNT(*) FILTER (WHERE status = 'OCCUPIED')::int AS occupied
      FROM "Table" WHERE active = true AND "mergedIntoId" IS NULL`;
  return r;
};

// Órdenes activas sin cobrar: cantidad y monto pendiente (productos + envío − pagado). WAITER: solo las suyas.
const activeOrders = async (userId: string | null) => {
  const [r] = await prisma.$queryRaw<{ count: number; pending: Prisma.Decimal }[]>`
    SELECT COUNT(*)::int AS count,
           COALESCE(SUM(
             (SELECT COALESCE(SUM(i.quantity * i."unitPrice"), 0) FROM "OrderItem" i WHERE i."orderId" = o.id)
             + COALESCE((SELECT d."deliveryFee" FROM "Delivery" d WHERE d."orderId" = o.id), 0)
             - (SELECT COALESCE(SUM(p.amount), 0) FROM "Payment" p WHERE p."orderId" = o.id)
           ), 0)::numeric(14,2) AS pending
      FROM "Order" o
     WHERE o.status IN ('OPEN', 'IN_KITCHEN', 'SERVED') ${userId ? Prisma.sql`AND o."userId" = ${userId}` : Prisma.empty}`;
  return { count: r.count, pending: money(r.pending) };
};

const deliveries = async () => {
  const rows = await prisma.delivery.groupBy({ by: ['status'], where: { status: { in: ['PENDING', 'IN_TRANSIT'] } }, _count: { _all: true } });
  const get = (s: string) => rows.find((x) => x.status === s)?._count._all ?? 0;
  return { PENDING: get('PENDING'), IN_TRANSIT: get('IN_TRANSIT') };
};

const cash = async () => {
  const s = await prisma.cashShift.findFirst({ where: { closedAt: null }, select: { openedAt: true } });
  return { open: !!s, openedAt: s?.openedAt ?? null };
};

const lowStock = (threshold: number) =>
  prisma.product.findMany({
    where:   { trackStock: true, stock: { lte: threshold } },
    select:  { id: true, name: true, stock: true },
    orderBy: [{ stock: 'asc' }, { name: 'asc' }],
    take:    10,
  });

// ── Ensamble ────────────────────────────────────────────────
export const dashboard = async (user: { id: string; role: Role }, now: Date = new Date()) => {
  const today = todayMazatlan();
  const yesterday = addDays(today, -1);
  const todayStart = mazatlanDayStart(today);
  const tomorrowStart = mazatlanDayStart(addDays(today, 1));
  const yStart = mazatlanDayStart(yesterday);
  // Ayer hasta la misma hora del día local (Mazatlán no tiene horario de verano: el día dura 24 h)
  const yEnd = new Date(yStart.getTime() + (now.getTime() - todayStart.getTime()));

  const seesSales   = user.role === 'ADMIN' || user.role === 'CASHIER';
  const seesFinance = user.role === 'ADMIN';
  const threshold   = lowStockThreshold();

  const [tbl, act, dlv, csh, low, sum, hours, top, methods, exp, week] = await Promise.all([
    tables(),
    activeOrders(user.role === 'WAITER' ? user.id : null),
    deliveries(),
    cash(),
    lowStock(threshold),
    seesSales ? salesSummary(todayStart, tomorrowStart, yStart, yEnd) : null,
    seesSales ? salesByHour(todayStart, tomorrowStart) : null,
    seesSales ? topProducts(todayStart, tomorrowStart) : null,
    seesSales ? byMethod(todayStart, tomorrowStart) : null,
    seesFinance ? expensesToday(todayStart, tomorrowStart) : null,
    seesFinance ? last7Days(today) : null,
  ]);

  const out: Record<string, unknown> = {
    date: today,
    generatedAt: now,
    operations: {
      tables: tbl,
      activeOrders: { ...act, scope: user.role === 'WAITER' ? 'mine' : 'all' },
      deliveries: dlv,
      cash: csh,
      lowStock: { threshold, items: low },
    },
  };

  if (sum && hours && top && methods) {
    const sales = money(sum.sales), ySales = money(sum.ySales);
    const delta = money(sales - ySales);
    out.sales = {
      total: sales,
      tickets: sum.tickets,
      averageTicket: sum.tickets ? money(sales / sum.tickets) : 0,
      comparison: {
        yesterdaySameTime: ySales,
        yesterdayTickets: sum.yTickets,
        delta,
        // Sin ventas ayer a esta hora no hay porcentaje (división por cero)
        pct: ySales === 0 ? null : Math.round((delta / ySales) * 10000) / 10000,
      },
      byHour: hours,
      topProducts: top,
      byMethod: methods,
    };
    if (seesFinance && exp !== null && week) {
      const cost = money(sum.cost);
      out.finance = { cost, expenses: exp, profit: money(sales - cost - exp), last7Days: week };
    }
  }
  return out;
};

