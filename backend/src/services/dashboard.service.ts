import { Prisma, Role } from '@prisma/client';
import { prisma } from '../lib/prisma';
import { addDays, mazatlanDayStart, todayMazatlan } from '../lib/mazatlan';
import { local } from './reports.service';

// Resumen del día (hora de Mazatlán) para el dashboard. Mismas reglas que los reportes:
// venta = orden PAID por Order.paidAt, importe = suma de sus Payment.amount, tickets = órdenes distintas.
//
// Todo sale de UNA sola consulta SQL (cada bloque como JSON): la conexión va por el pooler con
// connection_limit=1, así que varias consultas "en paralelo" se ejecutarían en serie (~0.5 s cada una).
// Los bloques que el rol no puede ver se quitan en el servidor antes de responder.

const n = (v: Prisma.Decimal | number | string | bigint | null | undefined) => (v == null ? 0 : Number(v));
const money = (v: Prisma.Decimal | number | string | null | undefined) => Math.round(n(v) * 100) / 100;

export const lowStockThreshold = () => {
  const v = Number.parseInt(process.env.LOW_STOCK_THRESHOLD ?? '', 10);
  return Number.isFinite(v) && v >= 0 ? v : 5;
};

type Num = number | string;
interface Row {
  summary:    { sales: Num; tickets: number; cost: Num; ySales: Num; yTickets: number };
  by_hour:    { hour: number; sales: Num; tickets: number }[];
  top:        { productId: string; name: string; quantity: number; sales: Num }[];
  methods:    { method: 'CASH' | 'CARD' | 'TRANSFER'; sales: Num; tickets: number }[];
  expenses:   Num;
  last7:      { date: string; sales: Num; tickets: number }[];
  tables:     { total: number; occupied: number };
  active:     { count: number; pending: Num };
  deliveries: { PENDING: number; IN_TRANSIT: number };
  cash_opened_at: string | null;
  low_stock:  { id: string; name: string; stock: number }[];
}

export const dashboard = async (user: { id: string; role: Role }, now: Date = new Date()) => {
  const today = todayMazatlan();
  const weekFrom = addDays(today, -6);
  const todayStart = mazatlanDayStart(today);
  const tomorrowStart = mazatlanDayStart(addDays(today, 1));
  const weekStart = mazatlanDayStart(weekFrom);
  const yStart = mazatlanDayStart(addDays(today, -1));
  // Ayer hasta la misma hora del día local (Mazatlán no tiene horario de verano: el día dura 24 h)
  const yEnd = new Date(yStart.getTime() + (now.getTime() - todayStart.getTime()));
  const threshold = lowStockThreshold();
  // WAITER: solo sus órdenes activas
  const mine = user.role === 'WAITER' ? Prisma.sql`AND o."userId" = ${user.id}` : Prisma.empty;

  const [r] = await prisma.$queryRaw<Row[]>`
    WITH paid AS (
      SELECT o.id, o."paidAt",
             (SELECT COALESCE(SUM(p.amount), 0) FROM "Payment" p WHERE p."orderId" = o.id) AS amount,
             (SELECT COALESCE(SUM(i.quantity * i."unitCost"), 0) FROM "OrderItem" i WHERE i."orderId" = o.id) AS cost
        FROM "Order" o
       WHERE o.status = 'PAID' AND o."paidAt" >= ${weekStart} AND o."paidAt" < ${tomorrowStart}
    ),
    today_paid AS (SELECT * FROM paid WHERE "paidAt" >= ${todayStart})
    SELECT
      (SELECT json_build_object(
          'sales',    COALESCE(SUM(amount) FILTER (WHERE "paidAt" >= ${todayStart}), 0),
          'tickets',  COUNT(*) FILTER (WHERE "paidAt" >= ${todayStart}),
          'cost',     COALESCE(SUM(cost) FILTER (WHERE "paidAt" >= ${todayStart}), 0),
          'ySales',   COALESCE(SUM(amount) FILTER (WHERE "paidAt" >= ${yStart} AND "paidAt" < ${yEnd}), 0),
          'yTickets', COUNT(*) FILTER (WHERE "paidAt" >= ${yStart} AND "paidAt" < ${yEnd}))
         FROM paid) AS summary,
      (SELECT json_agg(json_build_object('hour', h.hour, 'sales', COALESCE(s.sales, 0), 'tickets', COALESCE(s.tickets, 0)) ORDER BY h.hour)
         FROM generate_series(0, 23) AS h(hour)
         LEFT JOIN (SELECT EXTRACT(HOUR FROM ${local(Prisma.sql`"paidAt"`)})::int AS hr, SUM(amount) AS sales, COUNT(*)::int AS tickets
                      FROM today_paid GROUP BY 1) s ON s.hr = h.hour) AS by_hour,
      (SELECT COALESCE(json_agg(t ORDER BY t.quantity DESC, t.sales DESC, t.name), '[]'::json)
         FROM (SELECT pr.id AS "productId", pr.name, SUM(i.quantity)::int AS quantity, SUM(i.quantity * i."unitPrice") AS sales
                 FROM today_paid tp JOIN "OrderItem" i ON i."orderId" = tp.id JOIN "Product" pr ON pr.id = i."productId"
                GROUP BY pr.id, pr.name ORDER BY quantity DESC, sales DESC, pr.name LIMIT 5) t) AS top,
      (SELECT COALESCE(json_agg(m ORDER BY m.sales DESC), '[]'::json)
         FROM (SELECT p.method::text AS method, SUM(p.amount) AS sales, COUNT(DISTINCT tp.id)::int AS tickets
                 FROM today_paid tp JOIN "Payment" p ON p."orderId" = tp.id GROUP BY p.method) m) AS methods,
      -- Gastos de hoy: misma regla que los reportes (día local de expenseDate)
      (SELECT COALESCE(SUM(e.amount), 0) FROM "Expense" e
        WHERE e."expenseDate" >= ${todayStart} AND e."expenseDate" < ${tomorrowStart}) AS expenses,
      (SELECT json_agg(json_build_object('date', to_char(d.day, 'YYYY-MM-DD'), 'sales', COALESCE(s.sales, 0), 'tickets', COALESCE(s.tickets, 0)) ORDER BY d.day)
         FROM generate_series(${weekFrom}::date, ${today}::date, '1 day') AS d(day)
         LEFT JOIN (SELECT (${local(Prisma.sql`"paidAt"`)})::date AS day, SUM(amount) AS sales, COUNT(*)::int AS tickets
                      FROM paid GROUP BY 1) s ON s.day = d.day) AS last7,
      -- Mesas: un grupo unido cuenta como una sola (no se cuentan las secundarias)
      (SELECT json_build_object('total', COUNT(*), 'occupied', COUNT(*) FILTER (WHERE status = 'OCCUPIED'))
         FROM "Table" WHERE active = true AND "mergedIntoId" IS NULL) AS tables,
      -- Activas sin cobrar: productos + envío − pagado
      (SELECT json_build_object('count', COUNT(*), 'pending', COALESCE(SUM(
              (SELECT COALESCE(SUM(i.quantity * i."unitPrice"), 0) FROM "OrderItem" i WHERE i."orderId" = o.id)
            + COALESCE((SELECT d."deliveryFee" FROM "Delivery" d WHERE d."orderId" = o.id), 0)
            - (SELECT COALESCE(SUM(p.amount), 0) FROM "Payment" p WHERE p."orderId" = o.id)), 0))
         FROM "Order" o WHERE o.status IN ('OPEN', 'IN_KITCHEN', 'SERVED') ${mine}) AS active,
      (SELECT json_build_object('PENDING', COUNT(*) FILTER (WHERE status = 'PENDING'), 'IN_TRANSIT', COUNT(*) FILTER (WHERE status = 'IN_TRANSIT'))
         FROM "Delivery") AS deliveries,
      (SELECT to_char(MIN("openedAt"), 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') FROM "CashShift" WHERE "closedAt" IS NULL) AS cash_opened_at,
      (SELECT COALESCE(json_agg(l ORDER BY l.stock, l.name), '[]'::json)
         FROM (SELECT id, name, stock FROM "Product" WHERE "trackStock" = true AND stock <= ${threshold}
                ORDER BY stock, name LIMIT 10) l) AS low_stock`;

  const out: Record<string, unknown> = {
    date: today,
    generatedAt: now,
    operations: {
      tables:       { total: n(r.tables.total), occupied: n(r.tables.occupied) },
      activeOrders: { count: n(r.active.count), pending: money(r.active.pending), scope: user.role === 'WAITER' ? 'mine' : 'all' },
      deliveries:   { PENDING: n(r.deliveries.PENDING), IN_TRANSIT: n(r.deliveries.IN_TRANSIT) },
      cash:         { open: !!r.cash_opened_at, openedAt: r.cash_opened_at },
      lowStock:     { threshold, items: r.low_stock },
    },
  };

  // Ventas: ADMIN y CASHIER
  if (user.role === 'ADMIN' || user.role === 'CASHIER') {
    const s = r.summary;
    const sales = money(s.sales), ySales = money(s.ySales), tickets = n(s.tickets);
    const delta = money(sales - ySales);
    out.sales = {
      total: sales,
      tickets,
      averageTicket: tickets ? money(sales / tickets) : 0,
      comparison: {
        yesterdaySameTime: ySales,
        yesterdayTickets: n(s.yTickets),
        delta,
        // Sin ventas ayer a esta hora no hay porcentaje (división por cero)
        pct: ySales === 0 ? null : Math.round((delta / ySales) * 10000) / 10000,
      },
      byHour:      r.by_hour.map((h) => ({ hour: h.hour, sales: money(h.sales), tickets: n(h.tickets) })),
      topProducts: r.top.map((p) => ({ ...p, sales: money(p.sales) })),
      byMethod:    r.methods.map((m) => ({ ...m, sales: money(m.sales) })),
    };
    // Finanzas: solo ADMIN
    if (user.role === 'ADMIN') {
      const cost = money(s.cost), expenses = money(r.expenses);
      out.finance = {
        cost, expenses, profit: money(sales - cost - expenses),
        last7Days: r.last7.map((d) => ({ date: d.date, sales: money(d.sales), tickets: n(d.tickets) })),
      };
    }
  }
  return out;
};
