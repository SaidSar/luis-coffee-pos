import { z } from 'zod';
import { Prisma, OrderStatus } from '@prisma/client';
import { HttpError } from '../lib/http-error';

type Tx = Prisma.TransactionClient;

// Estados en los que una orden sigue abierta (ocupa la mesa y admite cambios o pago)
export const ACTIVE_STATUSES: OrderStatus[] = ['OPEN', 'IN_KITCHEN', 'SERVED'];

// Las transacciones van por el pooler de Supabase (RTT ~93 ms hasta us-east-1 y ~2 viajes por consulta
// con pgbouncer=true). maxWait: espera por conexión libre; timeout: duración máxima de la transacción.
// Holgados para que la latencia alta no produzca P2028 (las transacciones actuales tardan ~1-2 s).
export const TX_OPTS = { maxWait: 15_000, timeout: 30_000 };

// ── Schemas (zod) ───────────────────────────────────────────
const id = z.uuid({ message: 'ID inválido' });

const itemSchema = z.object({
  productId: id,
  quantity:  z.number().int().min(1).max(99),
  notes:     z.string().trim().max(200).optional(),
});

// ── Entregas a domicilio ────────────────────────────────────
export const MAX_DELIVERY_FEE = 1_000;

// Teléfono MX: se aceptan espacios, guiones, puntos, paréntesis y prefijo +52 / 52; se guardan 10 dígitos
export const phoneSchema = z.string().trim()
  .transform((s) => s.replace(/[\s\-().]/g, '').replace(/^\+?52(?=\d{10}$)/, ''))
  .refine((s) => /^\d{10}$/.test(s), { message: 'Teléfono inválido: 10 dígitos (ej. 669 123 4567)' });

const deliveryFee = z
  .union([z.number(), z.string().trim()])
  .refine((v) => /^\d+(\.\d{1,2})?$/.test(String(v)), { message: 'Cargo de envío inválido (máximo 2 decimales)' })
  .transform((v) => new Prisma.Decimal(String(v)))
  .refine((d) => d.lte(MAX_DELIVERY_FEE), { message: `El cargo de envío máximo es ${MAX_DELIVERY_FEE}` });

export const deliveryInputSchema = z.object({
  phone:       phoneSchema,
  address:     z.string().trim().min(1, { message: 'La dirección es obligatoria' }).max(250, { message: 'Máximo 250 caracteres' }),
  reference:   z.string().trim().max(200).optional().transform((s) => (s ? s : undefined)),
  deliveryFee: deliveryFee.default(new Prisma.Decimal(0)),
});

export const createOrderSchema = z
  .object({
    type:         z.enum(['DINE_IN', 'TAKEOUT', 'DELIVERY']),
    tableId:      id.optional(),
    customerName: z.string().trim().min(1).max(80).optional(),
    delivery:     deliveryInputSchema.optional(),
    items:        z.array(itemSchema).min(1).max(50),
  })
  .refine((d) => d.type !== 'DINE_IN' || d.tableId, {
    message: 'Las órdenes en mesa requieren tableId',
    path:    ['tableId'],
  })
  .refine((d) => d.type === 'DINE_IN' || !d.tableId, {
    message: 'Solo las órdenes en mesa llevan mesa',
    path:    ['tableId'],
  })
  .refine((d) => d.type !== 'DELIVERY' || d.customerName, {
    message: 'Las entregas a domicilio requieren el nombre del cliente',
    path:    ['customerName'],
  })
  .refine((d) => d.type !== 'DELIVERY' || d.delivery, {
    message: 'Las entregas a domicilio requieren teléfono y dirección',
    path:    ['delivery'],
  })
  .refine((d) => d.type === 'DELIVERY' || !d.delivery, {
    message: 'Solo las órdenes a domicilio llevan datos de entrega',
    path:    ['delivery'],
  });

export const addItemsSchema = z.object({ items: z.array(itemSchema).min(1).max(50) });

export const updateItemSchema = z
  .object({
    quantity: z.number().int().min(1).max(99),
    notes:    z.string().trim().max(200).nullable(),
  })
  .partial()
  .refine((d) => Object.keys(d).length > 0, { message: 'Indica quantity o notes' });

export const statusSchema = z.object({ status: z.enum(['IN_KITCHEN', 'SERVED', 'CANCELLED']) });

// Monto con máximo 2 decimales; se convierte a Decimal para no operar con floats
const money = z
  .union([z.number(), z.string().trim()])
  .refine((v) => /^\d+(\.\d{1,2})?$/.test(String(v)), { message: 'Monto inválido (máximo 2 decimales)' })
  .transform((v) => new Prisma.Decimal(String(v)))
  .refine((d) => d.gt(0) && d.lt(10_000_000), { message: 'Monto fuera de rango' });

export const paymentLineSchema = z.object({
  method:         z.enum(['CASH', 'CARD', 'TRANSFER']),
  amount:         money,
  amountReceived: money.optional(), // solo efectivo
});
const paymentLines = z.array(paymentLineSchema).min(1, { message: 'Indica al menos un pago' }).max(5, { message: 'Máximo 5 pagos por cuenta' });

// Cobrar todo (POST /:id/payment): cuerpo anterior {method, amountReceived} o nuevo {payments:[...]}
export const paymentSchema = z.union([
  z.object({ payments: paymentLines }).strict(),
  z.object({ method: z.enum(['CASH', 'CARD', 'TRANSFER']), amountReceived: money }),
], { message: 'Indica method y amountReceived, o payments' });

// Cobrar una cuenta (POST /:id/splits/pay)
export const splitPaySchema = z.object({
  label:    z.string().trim().max(60, { message: 'Máximo 60 caracteres' }).optional().transform((s) => (s ? s : undefined)),
  items:    z.array(z.object({ orderItemId: id, quantity: z.number().int().min(1, { message: 'La cantidad debe ser mayor a 0' }).max(99) }))
    .min(1, { message: 'Elige al menos un producto' }).max(100)
    .refine((a) => new Set(a.map((x) => x.orderItemId)).size === a.length, { message: 'Hay productos repetidos' }),
  payments: paymentLines,
});

export const listQuerySchema = z.object({
  status: z
    .string()
    .optional()
    .transform((s) => (s ? s.split(',').map((v) => v.trim()) : undefined))
    .pipe(z.array(z.enum(OrderStatus)).optional()),
});

// ── Include y vista con totales ─────────────────────────────
// Con relationJoins (schema.prisma) este include se resuelve en UNA consulta.
// Items en orden cronológico (rondas); desempate por id dentro de una misma ronda.
export const orderInclude = {
  items:   {
    include: { product: { select: { id: true, name: true } }, splitItems: { select: { quantity: true } } },
    orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
  },
  table:    { select: { id: true, number: true } },
  user:     { select: { id: true, name: true } },
  payments: { orderBy: [{ paidAt: 'asc' }, { id: 'asc' }] },
  splits:   {
    include: { items: { select: { orderItemId: true, quantity: true } }, payments: { orderBy: { id: 'asc' } } },
    orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
  },
  delivery: true,
} satisfies Prisma.OrderInclude;

export type OrderWithRelations = Prisma.OrderGetPayload<{ include: typeof orderInclude }>;

// Suma de productos (sin cargos)
export const orderTotal = (items: { unitPrice: Prisma.Decimal; quantity: number }[]) =>
  items.reduce((sum, i) => sum.add(i.unitPrice.mul(i.quantity)), new Prisma.Decimal(0));

// Totales calculados en el servidor con Decimal y enviados como string con 2 decimales.
// total = productos + cargo de envío (si es entrega a domicilio)
// Vista de la orden: totales, lo cobrado por cuentas y lo que falta (todo calculado en el servidor).
// "payment" se conserva por compatibilidad: último pago registrado (o null).
export const toOrderView = (order: OrderWithRelations) => {
  const itemsTotal = orderTotal(order.items);
  const fee = order.delivery?.deliveryFee ?? new Prisma.Decimal(0);
  const total = itemsTotal.add(fee);
  const paidAmount = order.payments.reduce((a, p) => a.add(p.amount), new Prisma.Decimal(0));
  const { splits, payments, items, ...rest } = order;
  return {
    ...rest,
    items: items.map(({ splitItems, ...i }) => {
      const assigned = splitItems.reduce((a, x) => a + x.quantity, 0);
      return { ...i, lineTotal: i.unitPrice.mul(i.quantity).toFixed(2), paidQuantity: assigned, remaining: i.quantity - assigned };
    }),
    itemsTotal: itemsTotal.toFixed(2),
    total:      total.toFixed(2),
    paidAmount: paidAmount.toFixed(2),
    balance:    order.status === 'CANCELLED' ? '0.00' : total.sub(paidAmount).toFixed(2),
    paid:       order.status === 'PAID',
    payments,
    payment:    payments[payments.length - 1] ?? null,
    splits:     splits.map((sp, idx) => ({
      id: sp.id, label: sp.label, number: idx + 1, amount: sp.amount.toFixed(2), createdAt: sp.createdAt,
      items: sp.items, payments: sp.payments,
    })),
  };
};

// Payload del evento delivery:updated (el cliente solo lo usa para refrescar; datos mínimos)
export const deliveryEvent = (o: { id: string; ticketNumber: number; status: OrderStatus; delivery: { id: string; status: string } | null }) => ({
  id:           o.delivery?.id,
  orderId:      o.id,
  ticketNumber: o.ticketNumber,
  status:       o.delivery?.status,
  orderStatus:  o.status,
  paid:         o.status === 'PAID',
});

// ── Reglas compartidas ──────────────────────────────────────
type TrackedProduct = { id: string; name: string; stock: number };

// Una sola consulta: valida que existan y estén disponibles, congela precio y costo (unitPrice, unitCost)
// y devuelve los datos de stock de los productos con trackStock para assertStock.
export const resolveItems = async (tx: Tx, items: z.infer<typeof itemSchema>[]) => {
  const ids = [...new Set(items.map((i) => i.productId))];
  const products = await tx.product.findMany({
    where:  { id: { in: ids } },
    select: { id: true, name: true, price: true, cost: true, isAvailable: true, trackStock: true, stock: true },
  });
  const byId = new Map(products.map((p) => [p.id, p]));

  const missing = ids.filter((pid) => !byId.has(pid));
  if (missing.length) throw new HttpError(404, 'Producto no encontrado', { productIds: missing });

  const unavailable = products.filter((p) => !p.isAvailable).map((p) => p.name);
  if (unavailable.length) throw new HttpError(409, 'Productos no disponibles', { products: unavailable });

  return {
    items: items.map((i) => ({
      productId: i.productId,
      quantity:  i.quantity,
      notes:     i.notes || null,
      unitPrice: byId.get(i.productId)!.price,
      unitCost:  byId.get(i.productId)!.cost, // snapshot del costo para reportes de margen
    })),
    tracked: products.filter((p) => p.trackStock).map(({ id, name, stock }) => ({ id, name, stock })),
  };
};

// Suma cantidades por producto
export const sumByProduct = (items: { productId: string; quantity: number }[]) => {
  const totals = new Map<string, number>();
  for (const i of items) totals.set(i.productId, (totals.get(i.productId) ?? 0) + i.quantity);
  return totals;
};

// Al crear o agregar productos: verifica stock de lo pedido más lo que ya tiene la orden.
// Solo productos con trackStock=true; si no hay ninguno no consulta nada. El descuento real ocurre al cobrar.
export const assertStock = async (
  tx: Tx,
  newItems: { productId: string; quantity: number }[],
  tracked: TrackedProduct[],
  orderId?: string,
) => {
  if (tracked.length === 0) return;
  const trackedIds = tracked.map((p) => p.id);
  const existing = orderId
    ? await tx.orderItem.findMany({
        where:  { orderId, productId: { in: trackedIds } },
        select: { productId: true, quantity: true },
      })
    : [];
  const needed = sumByProduct([...existing, ...newItems]);
  const insufficient = tracked.filter((p) => p.stock < (needed.get(p.id) ?? 0)).map((p) => p.name);
  if (insufficient.length) throw new HttpError(409, 'Stock insuficiente', { products: insufficient });
};

// Productos con control de stock entre los indicados (para cambios de cantidad de un ítem)
export const trackedProducts = (tx: Tx, ids: string[]) =>
  tx.product.findMany({ where: { id: { in: ids }, trackStock: true }, select: { id: true, name: true, stock: true } });

// Marca la mesa OCCUPIED y devuelve su orden activa en UNA consulta. El UPDATE bloquea la fila
// hasta el commit, así que dos pedidos simultáneos a la misma mesa se serializan.
// Si ya tenía orden activa, la mesa ya estaba OCCUPIED: el estado no cambia en la práctica.
// Vista de una mesa para eventos table:updated
export interface TableEvent { id: string; number: number; capacity: number; status: string; active: boolean; mergedIntoId: string | null }

// Ocupa la mesa para una orden en mesa. Bloquea la fila: una mesa desactivada o unida a otra (secundaria) no admite órdenes.
export const occupyTable = async (tx: Tx, tableId: string) => {
  const [cur] = await tx.$queryRaw<{ active: boolean; mergedIntoId: string | null; principal: number | null }[]>`
    SELECT t.active, t."mergedIntoId", p.number AS principal
      FROM "Table" t LEFT JOIN "Table" p ON p.id = t."mergedIntoId"
     WHERE t.id = ${tableId}
       FOR UPDATE OF t`;
  if (!cur) throw new HttpError(404, 'Mesa no encontrada');
  if (!cur.active) throw new HttpError(409, 'La mesa está desactivada');
  if (cur.mergedIntoId) throw new HttpError(409, `La mesa está unida a la mesa ${cur.principal}: usa la mesa principal`);

  const rows = await tx.$queryRaw<(TableEvent & { activeOrderId: string | null })[]>`
    UPDATE "Table" t
       SET status = 'OCCUPIED'
     WHERE t.id = ${tableId}
 RETURNING t.id, t.number, t.capacity, t.status::text AS status, t.active, t."mergedIntoId",
           (SELECT o.id FROM "Order" o
             WHERE o."tableId" = t.id AND o.status IN ('OPEN', 'IN_KITCHEN', 'SERVED')
             ORDER BY o."createdAt" LIMIT 1) AS "activeOrderId"`;
  const { activeOrderId, ...table } = rows[0];
  return { table, activeOrderId };
};

export interface LockedOrder {
  status:      OrderStatus;
  tableId:     string | null;
  paid:        boolean;
  itemCount:   number;
  deliveryId:  string | null;
  deliveryFee: Prisma.Decimal; // 0 si no es entrega a domicilio
}

// Bloquea la orden (FOR UPDATE) y devuelve en la misma consulta lo que las reglas necesitan
export const lockOrder = async (tx: Tx, orderId: string): Promise<LockedOrder> => {
  const rows = await tx.$queryRaw<LockedOrder[]>`
    SELECT o.status::text AS status,
           o."tableId",
           -- hay algún pago (aunque la orden no esté saldada): impide cancelar
           EXISTS (SELECT 1 FROM "Payment" p WHERE p."orderId" = o.id) AS paid,
           (SELECT count(*)::int FROM "OrderItem" i WHERE i."orderId" = o.id) AS "itemCount",
           d.id AS "deliveryId",
           COALESCE(d."deliveryFee", 0)::numeric(10,2) AS "deliveryFee"
      FROM "Order" o
      LEFT JOIN "Delivery" d ON d."orderId" = o.id
     WHERE o.id = ${orderId}
       FOR UPDATE OF o`;
  if (rows.length === 0) throw new HttpError(404, 'Orden no encontrada');
  return rows[0];
};

// Descuenta stock en UN solo UPDATE condicional para los productos con trackStock=true.
// Si alguna fila no se actualiza (stock insuficiente) lanza 409 con los nombres; el throw revierte la transacción.
export const decrementStock = async (
  tx: Tx,
  items: { productId: string; quantity: number; product: { name: string; trackStock: boolean } }[],
) => {
  const tracked = items.filter((i) => i.product.trackStock);
  if (tracked.length === 0) return;

  const needed = sumByProduct(tracked);
  const names  = new Map(tracked.map((i) => [i.productId, i.product.name]));
  const ids    = [...needed.keys()];
  const qtys   = ids.map((id) => needed.get(id)!);

  const updated = await tx.$queryRaw<{ id: string }[]>`
    UPDATE "Product" p
       SET stock = p.stock - r.qty
      FROM unnest(${ids}::text[], ${qtys}::int[]) AS r(id, qty)
     WHERE p.id = r.id AND p."trackStock" = true AND p.stock >= r.qty
 RETURNING p.id`;

  if (updated.length !== ids.length) {
    const ok = new Set(updated.map((r) => r.id));
    throw new HttpError(409, 'Stock insuficiente', { products: ids.filter((id) => !ok.has(id)).map((id) => names.get(id)!) });
  }
};

// Libera la mesa (UN solo UPDATE) si estaba OCCUPIED y ya no le quedan órdenes activas.
// Devuelve la mesa con la misma forma que Prisma, o null si no cambió.
// Libera la mesa si ya no tiene órdenes activas y deshace su grupo (secundarias → AVAILABLE, sin unión),
// en la misma transacción. Devuelve todas las mesas afectadas para emitir table:updated tras el commit.
export const freeTableIfIdle = async (tx: Tx, tableId: string | null): Promise<TableEvent[]> => {
  if (!tableId) return [];
  const main = await tx.$queryRaw<TableEvent[]>`
    UPDATE "Table" t
       SET status = 'AVAILABLE'
     WHERE t.id = ${tableId}
       AND t.status = 'OCCUPIED'
       AND NOT EXISTS (SELECT 1 FROM "Order" o
                        WHERE o."tableId" = t.id AND o.status IN ('OPEN', 'IN_KITCHEN', 'SERVED'))
 RETURNING t.id, t.number, t.capacity, t.status::text AS status, t.active, t."mergedIntoId"`;
  if (main.length === 0) return [];
  const secondaries = await tx.$queryRaw<TableEvent[]>`
    UPDATE "Table" t
       SET status = 'AVAILABLE', "mergedIntoId" = NULL
     WHERE t."mergedIntoId" = ${tableId}
 RETURNING t.id, t.number, t.capacity, t.status::text AS status, t.active, t."mergedIntoId"`;
  return [...main, ...secondaries];
};

export const assertActive = (status: OrderStatus) => {
  if (!ACTIVE_STATUSES.includes(status)) throw new HttpError(409, 'La orden ya no admite cambios');
};
