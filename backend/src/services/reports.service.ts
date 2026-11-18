import { Prisma } from '@prisma/client';
import { prisma } from '../lib/prisma';

// Reportes con consultas agregadas en SQL. Todo valor externo va como parámetro ($queryRaw con
// template literal de Prisma), nunca interpolado como texto.
//
// Fechas: las columnas DateTime de Prisma son "timestamp" sin zona que guardan UTC.
//   - Hora local:   (col AT TIME ZONE 'UTC') AT TIME ZONE 'America/Mazatlan'
//   - Rango:        [from 00:00 local, to+1 00:00 local) convertido a UTC  → "to" es inclusivo
// Ventas: órdenes PAID cuya fecha Order.paidAt (cuando se saldó) cae en el rango. Importe = suma de sus
// Payment.amount (porciones aplicadas; con cuenta dividida hay varios pagos por orden). Tickets = órdenes.

export const REPORT_TZ = 'America/Mazatlan';
export type GroupBy = 'day' | 'week' | 'month';

export interface ReportRange { from: string; to: string } // YYYY-MM-DD (zona America/Mazatlan)

export const local = (col: Prisma.Sql) => Prisma.sql`((${col} AT TIME ZONE 'UTC') AT TIME ZONE 'America/Mazatlan')`;
export const startUtc = (d: string) => Prisma.sql`(((${d}::date)::timestamp AT TIME ZONE 'America/Mazatlan') AT TIME ZONE 'UTC')`;
export const endUtcExcl = (d: string) => Prisma.sql`((((${d}::date) + 1)::timestamp AT TIME ZONE 'America/Mazatlan') AT TIME ZONE 'UTC')`;
export const inRange = (col: Prisma.Sql, r: ReportRange) => Prisma.sql`${col} >= ${startUtc(r.from)} AND ${col} < ${endUtcExcl(r.to)}`;

// Órdenes saldadas en el rango (base de todas las ventas): una fila por orden
const paidOrders = (r: ReportRange) => Prisma.sql`
  SELECT o.id, o."userId", o."paidAt",
         (SELECT COALESCE(SUM(p.amount), 0) FROM "Payment" p WHERE p."orderId" = o.id) AS amount
    FROM "Order" o
   WHERE o.status = 'PAID' AND ${inRange(Prisma.sql`o."paidAt"`, r)}`;

const n = (v: Prisma.Decimal | number | bigint | null | undefined) => (v == null ? 0 : Number(v));
const money = (v: Prisma.Decimal | number | null | undefined) => Math.round(n(v) * 100) / 100;
const ratio = (a: number, b: number) => (b === 0 ? 0 : Math.round((a / b) * 10000) / 10000);

// ── Resumen ──────────────────────────────────────────────────
export interface Summary {
  from: string; to: string;
  sales: number; tickets: number; averageTicket: number;
  cost: number; grossMargin: number; grossMarginPct: number;
  expenses: number; profit: number;
  itemsSold: number; cancelledOrders: number;
  // Conciliación: sales = productSales + deliveryFees
  productSales: number; deliveryFees: number;
  deliveriesDelivered: number; deliveriesCancelled: number;
}

export const summary = async (r: ReportRange): Promise<Summary> => {
  const [row] = await prisma.$queryRaw<{
    sales: Prisma.Decimal | null; tickets: number; cost: Prisma.Decimal | null; items: number | null; fees: Prisma.Decimal | null;
  }[]>`
    WITH paid AS (${paidOrders(r)})
    SELECT (SELECT COALESCE(SUM(amount), 0) FROM paid)::numeric(14,2)            AS sales,
           (SELECT COUNT(*) FROM paid)::int                                       AS tickets,
           (SELECT COALESCE(SUM(i.quantity * i."unitCost"), 0)
              FROM "OrderItem" i JOIN paid ON paid.id = i."orderId")::numeric(14,2) AS cost,
           (SELECT COALESCE(SUM(i.quantity), 0)
              FROM "OrderItem" i JOIN paid ON paid.id = i."orderId")::int        AS items,
           (SELECT COALESCE(SUM(d."deliveryFee"), 0)
              FROM "Delivery" d JOIN paid ON paid.id = d."orderId")::numeric(14,2) AS fees`;

  // Entregas realizadas (por fecha de entrega) y canceladas (por fecha de cancelación de la orden)
  const [dl] = await prisma.$queryRaw<{ delivered: number; cancelled: number }[]>`
    SELECT (SELECT COUNT(*) FROM "Delivery" d
             WHERE d.status = 'DELIVERED' AND ${inRange(Prisma.sql`d."deliveredAt"`, r)})::int AS delivered,
           (SELECT COUNT(*) FROM "Delivery" d JOIN "Order" o ON o.id = d."orderId"
             WHERE d.status = 'CANCELLED' AND ${inRange(Prisma.sql`o."updatedAt"`, r)})::int AS cancelled`;

  // Canceladas: por fecha de cancelación (updatedAt de la orden al pasar a CANCELLED)
  const [cancel] = await prisma.$queryRaw<{ count: number }[]>`
    SELECT COUNT(*)::int AS count FROM "Order" o
     WHERE o.status = 'CANCELLED' AND ${inRange(Prisma.sql`o."updatedAt"`, r)}`;

  const [exp] = await prisma.$queryRaw<{ total: Prisma.Decimal | null }[]>`
    SELECT COALESCE(SUM(e.amount), 0)::numeric(14,2) AS total FROM "Expense" e
     WHERE ${inRange(Prisma.sql`e."expenseDate"`, r)}`;

  const sales = money(row.sales), cost = money(row.cost), expenses = money(exp.total), fees = money(row.fees);
  const grossMargin = money(sales - cost);
  return {
    from: r.from, to: r.to,
    sales, tickets: row.tickets, averageTicket: row.tickets ? money(sales / row.tickets) : 0,
    cost, grossMargin, grossMarginPct: ratio(grossMargin, sales),
    expenses, profit: money(grossMargin - expenses),
    itemsSold: n(row.items), cancelledOrders: cancel.count,
    productSales: money(sales - fees), deliveryFees: fees,
    deliveriesDelivered: dl.delivered, deliveriesCancelled: dl.cancelled,
  };
};

// ── Entregas a domicilio del periodo (por fecha de creación de la orden) ──
export interface DeliveryRow {
  date: string; ticketNumber: number; customer: string; phone: string; address: string;
  driver: string; fee: number; status: string; minutes: number | null;
}

export const deliveries = async (r: ReportRange): Promise<DeliveryRow[]> => {
  const rows = await prisma.$queryRaw<{
    date: string; ticketNumber: number; customer: string | null; phone: string; address: string;
    driver: string | null; fee: Prisma.Decimal; status: string; minutes: number | null;
  }[]>`
    SELECT to_char(${local(Prisma.sql`d."createdAt"`)}, 'YYYY-MM-DD') AS date,
           o."ticketNumber", o."customerName" AS customer, d.phone, d.address,
           d."driverName" AS driver, d."deliveryFee" AS fee, d.status::text AS status,
           -- Minutos desde que se registró la orden hasta que se entregó
           CASE WHEN d."deliveredAt" IS NULL THEN NULL
                ELSE ROUND(EXTRACT(EPOCH FROM (d."deliveredAt" - d."createdAt")) / 60)::int END AS minutes
      FROM "Delivery" d JOIN "Order" o ON o.id = d."orderId"
     WHERE ${inRange(Prisma.sql`d."createdAt"`, r)}
     ORDER BY d."createdAt", o."ticketNumber"`;
  return rows.map((x) => ({ ...x, customer: x.customer ?? '', driver: x.driver ?? '', fee: money(x.fee) }));
};

// ── Cortes de caja: turnos cerrados en el periodo (por fecha de cierre, hora de Mazatlán) ──
export interface CashShiftRow {
  shift: string; openedBy: string; closedBy: string; openingFloat: number;
  expectedCash: number; countedCash: number; difference: number; notes: string;
}

export const cashShifts = async (r: ReportRange): Promise<CashShiftRow[]> => {
  const rows = await prisma.$queryRaw<{
    shift: string; openedBy: string; closedBy: string | null; openingFloat: Prisma.Decimal;
    expectedCash: Prisma.Decimal | null; countedCash: Prisma.Decimal | null; difference: Prisma.Decimal | null; notes: string | null;
  }[]>`
    SELECT to_char(${local(Prisma.sql`s."openedAt"`)}, 'DD/MM/YYYY HH24:MI') || ' – ' ||
           to_char(${local(Prisma.sql`s."closedAt"`)}, CASE
             WHEN ${local(Prisma.sql`s."openedAt"`)}::date = ${local(Prisma.sql`s."closedAt"`)}::date THEN 'HH24:MI'
             ELSE 'DD/MM/YYYY HH24:MI' END) AS shift,
           uo.name AS "openedBy", uc.name AS "closedBy", s."openingFloat", s."expectedCash",
           s."countedCash", s.difference, s.notes
      FROM "CashShift" s
      JOIN "User" uo ON uo.id = s."openedById"
      LEFT JOIN "User" uc ON uc.id = s."closedById"
     WHERE s."closedAt" IS NOT NULL AND ${inRange(Prisma.sql`s."closedAt"`, r)}
     ORDER BY s."closedAt"`;
  return rows.map((x) => ({
    shift: x.shift, openedBy: x.openedBy, closedBy: x.closedBy ?? '', openingFloat: money(x.openingFloat),
    expectedCash: money(x.expectedCash), countedCash: money(x.countedCash), difference: money(x.difference), notes: x.notes ?? '',
  }));
};

// ── Ventas por periodo (día, semana ISO desde lunes, mes) ────
export interface SalesPeriod { period: string; label: string; tickets: number; sales: number; cost: number; grossMargin: number }

export const salesByPeriod = async (r: ReportRange, groupBy: GroupBy): Promise<SalesPeriod[]> => {
  // date_trunc('week', …) en Postgres usa semanas ISO (inician en lunes)
  const rows = await prisma.$queryRaw<{
    period: string; label: string; tickets: number; sales: Prisma.Decimal; cost: Prisma.Decimal;
  }[]>`
    WITH paid AS (${paidOrders(r)}),
    per_order AS (
      SELECT paid.id, paid.amount,
             date_trunc(${groupBy}, ${local(Prisma.sql`paid."paidAt"`)}) AS bucket,
             (SELECT COALESCE(SUM(i.quantity * i."unitCost"), 0) FROM "OrderItem" i WHERE i."orderId" = paid.id) AS cost
        FROM paid
    ),
    buckets AS (
      SELECT generate_series(
               date_trunc(${groupBy}, (${r.from}::date)::timestamp),
               date_trunc(${groupBy}, (${r.to}::date)::timestamp),
               ('1 ' || ${groupBy})::interval) AS bucket
    )
    SELECT to_char(b.bucket, 'YYYY-MM-DD') AS period,
           CASE ${groupBy}
             WHEN 'week'  THEN to_char(b.bucket, 'IYYY-"S"IW')
             WHEN 'month' THEN to_char(b.bucket, 'YYYY-MM')
             ELSE to_char(b.bucket, 'YYYY-MM-DD')
           END AS label,
           COUNT(po.id)::int                              AS tickets,
           COALESCE(SUM(po.amount), 0)::numeric(14,2)     AS sales,
           COALESCE(SUM(po.cost), 0)::numeric(14,2)       AS cost
      FROM buckets b
      LEFT JOIN per_order po ON po.bucket = b.bucket
     GROUP BY b.bucket
     ORDER BY b.bucket`;

  return rows.map((x) => {
    const sales = money(x.sales), cost = money(x.cost);
    return { period: x.period, label: x.label, tickets: x.tickets, sales, cost, grossMargin: money(sales - cost) };
  });
};

// ── Por producto y por categoría ─────────────────────────────
export interface ProductRow { productId: string; product: string; category: string; quantity: number; sales: number; cost: number; grossMargin: number; grossMarginPct: number }

export const byProduct = async (r: ReportRange): Promise<ProductRow[]> => {
  const rows = await prisma.$queryRaw<{
    productId: string; product: string; category: string; quantity: number; sales: Prisma.Decimal; cost: Prisma.Decimal;
  }[]>`
    WITH paid AS (${paidOrders(r)})
    SELECT pr.id AS "productId", pr.name AS product, c.name AS category,
           SUM(i.quantity)::int                               AS quantity,
           SUM(i.quantity * i."unitPrice")::numeric(14,2)     AS sales,
           SUM(i.quantity * i."unitCost")::numeric(14,2)      AS cost
      FROM paid
      JOIN "OrderItem" i ON i."orderId" = paid.id
      JOIN "Product"  pr ON pr.id = i."productId"
      JOIN "Category" c  ON c.id = pr."categoryId"
     GROUP BY pr.id, pr.name, c.name
     ORDER BY sales DESC, pr.name`;
  return rows.map((x) => {
    const sales = money(x.sales), cost = money(x.cost), gm = money(sales - cost);
    return { productId: x.productId, product: x.product, category: x.category, quantity: x.quantity, sales, cost, grossMargin: gm, grossMarginPct: ratio(gm, sales) };
  });
};

export interface CategoryRow { category: string; quantity: number; sales: number; cost: number; grossMargin: number }

export const byCategory = async (r: ReportRange): Promise<CategoryRow[]> => {
  const rows = await prisma.$queryRaw<{ category: string; quantity: number; sales: Prisma.Decimal; cost: Prisma.Decimal }[]>`
    WITH paid AS (${paidOrders(r)})
    SELECT c.name AS category,
           SUM(i.quantity)::int                           AS quantity,
           SUM(i.quantity * i."unitPrice")::numeric(14,2) AS sales,
           SUM(i.quantity * i."unitCost")::numeric(14,2)  AS cost
      FROM paid
      JOIN "OrderItem" i ON i."orderId" = paid.id
      JOIN "Product"  pr ON pr.id = i."productId"
      JOIN "Category" c  ON c.id = pr."categoryId"
     GROUP BY c.id, c.name
     ORDER BY sales DESC, c.name`;
  return rows.map((x) => {
    const sales = money(x.sales), cost = money(x.cost);
    return { category: x.category, quantity: x.quantity, sales, cost, grossMargin: money(sales - cost) };
  });
};

// ── Por método de pago ───────────────────────────────────────
export interface PaymentMethodRow { method: 'CASH' | 'CARD' | 'TRANSFER'; tickets: number; sales: number }

export const byPaymentMethod = async (r: ReportRange): Promise<PaymentMethodRow[]> => {
  const rows = await prisma.$queryRaw<{ method: PaymentMethodRow['method']; tickets: number; sales: Prisma.Decimal }[]>`
    WITH paid AS (${paidOrders(r)})
    -- Suma de las porciones por método; tickets = órdenes distintas que usaron ese método
    SELECT p.method::text AS method, COUNT(DISTINCT paid.id)::int AS tickets, SUM(p.amount)::numeric(14,2) AS sales
      FROM paid JOIN "Payment" p ON p."orderId" = paid.id
     GROUP BY p.method ORDER BY sales DESC`;
  return rows.map((x) => ({ method: x.method, tickets: x.tickets, sales: money(x.sales) }));
};

// ── Por empleado (quien tomó la orden) ───────────────────────
export interface EmployeeRow { userId: string; employee: string; role: string; tickets: number; sales: number; averageTicket: number }

export const byEmployee = async (r: ReportRange): Promise<EmployeeRow[]> => {
  const rows = await prisma.$queryRaw<{ userId: string; employee: string; role: string; tickets: number; sales: Prisma.Decimal }[]>`
    WITH paid AS (${paidOrders(r)})
    SELECT u.id AS "userId", u.name AS employee, u.role::text AS role,
           COUNT(*)::int AS tickets, SUM(paid.amount)::numeric(14,2) AS sales
      FROM paid JOIN "User" u ON u.id = paid."userId"
     GROUP BY u.id, u.name, u.role
     ORDER BY sales DESC, u.name`;
  return rows.map((x) => {
    const sales = money(x.sales);
    return { userId: x.userId, employee: x.employee, role: x.role, tickets: x.tickets, sales, averageTicket: x.tickets ? money(sales / x.tickets) : 0 };
  });
};

// ── Gastos del periodo ───────────────────────────────────────
export interface ExpenseRow { date: string; description: string; category: string; user: string; amount: number }

export const expenses = async (r: ReportRange): Promise<ExpenseRow[]> => {
  const rows = await prisma.$queryRaw<{ date: string; description: string; category: string; user: string; amount: Prisma.Decimal }[]>`
    SELECT to_char(${local(Prisma.sql`e."expenseDate"`)}, 'YYYY-MM-DD') AS date,
           e.description, e.category, u.name AS "user", e.amount::numeric(14,2) AS amount
      FROM "Expense" e JOIN "User" u ON u.id = e."userId"
     WHERE ${inRange(Prisma.sql`e."expenseDate"`, r)}
     ORDER BY e."expenseDate", e.description`;
  return rows.map((x) => ({ ...x, amount: money(x.amount) }));
};

// ── Inventario (estado actual, no depende del rango) ─────────
export interface InventoryRow {
  product: string; category: string; price: number; cost: number;
  trackStock: boolean; stock: number; isAvailable: boolean; stockValue: number;
}

export const inventory = async (): Promise<InventoryRow[]> => {
  const rows = await prisma.$queryRaw<{
    product: string; category: string; price: Prisma.Decimal; cost: Prisma.Decimal; trackStock: boolean; stock: number; isAvailable: boolean;
  }[]>`
    SELECT pr.name AS product, c.name AS category, pr.price, pr.cost, pr."trackStock", pr.stock, pr."isAvailable"
      FROM "Product" pr JOIN "Category" c ON c.id = pr."categoryId"
     ORDER BY c.name, pr.name`;
  return rows.map((x) => ({
    product: x.product, category: x.category, price: money(x.price), cost: money(x.cost),
    trackStock: x.trackStock, stock: x.stock, isAvailable: x.isAvailable,
    // Valor del inventario solo para productos con control de stock
    stockValue: x.trackStock ? money(n(x.cost) * x.stock) : 0,
  }));
};
