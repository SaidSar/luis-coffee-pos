import { z } from 'zod';
import { Prisma, OrderStatus } from '@prisma/client';
import { HttpError } from '../lib/http-error';

type Tx = Prisma.TransactionClient;

// Estados en los que una orden sigue abierta (ocupa la mesa y admite cambios o pago)
export const ACTIVE_STATUSES: OrderStatus[] = ['OPEN', 'IN_KITCHEN', 'SERVED'];

// Las transacciones van por el pooler de Supabase: damos margen a la latencia
export const TX_OPTS = { maxWait: 10_000, timeout: 20_000 };

// ── Schemas (zod) ───────────────────────────────────────────
const id = z.uuid({ message: 'ID inválido' });

const itemSchema = z.object({
  productId: id,
  quantity:  z.number().int().min(1).max(99),
  notes:     z.string().trim().max(200).optional(),
});

export const createOrderSchema = z
  .object({
    type:         z.enum(['DINE_IN', 'TAKEOUT']),
    tableId:      id.optional(),
    customerName: z.string().trim().min(1).max(80).optional(),
    items:        z.array(itemSchema).min(1).max(50),
  })
  .refine((d) => d.type !== 'DINE_IN' || d.tableId, {
    message: 'Las órdenes en mesa requieren tableId',
    path:    ['tableId'],
  })
  .refine((d) => d.type !== 'TAKEOUT' || !d.tableId, {
    message: 'Las órdenes para llevar no llevan mesa',
    path:    ['tableId'],
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

export const paymentSchema = z.object({
  method:         z.enum(['CASH', 'CARD', 'TRANSFER']),
  amountReceived: money,
});

export const listQuerySchema = z.object({
  status: z
    .string()
    .optional()
    .transform((s) => (s ? s.split(',').map((v) => v.trim()) : undefined))
    .pipe(z.array(z.enum(OrderStatus)).optional()),
});

// ── Include y vista con totales ─────────────────────────────
export const orderInclude = {
  items:   { include: { product: { select: { id: true, name: true } } }, orderBy: { id: 'asc' } },
  table:   { select: { id: true, number: true } },
  user:    { select: { id: true, name: true } },
  payment: true,
} satisfies Prisma.OrderInclude;

export type OrderWithRelations = Prisma.OrderGetPayload<{ include: typeof orderInclude }>;

export const orderTotal = (items: { unitPrice: Prisma.Decimal; quantity: number }[]) =>
  items.reduce((sum, i) => sum.add(i.unitPrice.mul(i.quantity)), new Prisma.Decimal(0));

// Totales calculados en el servidor con Decimal y enviados como string con 2 decimales
export const toOrderView = (order: OrderWithRelations) => ({
  ...order,
  items: order.items.map((i) => ({ ...i, lineTotal: i.unitPrice.mul(i.quantity).toFixed(2) })),
  total: orderTotal(order.items).toFixed(2),
});

// ── Reglas compartidas ──────────────────────────────────────
// Valida productos (existen y están disponibles) y congela el precio actual en unitPrice
export const resolveItems = async (tx: Tx, items: z.infer<typeof itemSchema>[]) => {
  const ids = [...new Set(items.map((i) => i.productId))];
  const products = await tx.product.findMany({
    where:  { id: { in: ids } },
    select: { id: true, name: true, price: true, isAvailable: true },
  });
  // (el stock se valida aparte con assertStock, solo para productos con trackStock)
  const byId = new Map(products.map((p) => [p.id, p]));

  const missing = ids.filter((pid) => !byId.has(pid));
  if (missing.length) throw new HttpError(404, 'Producto no encontrado', { productIds: missing });

  const unavailable = products.filter((p) => !p.isAvailable).map((p) => p.name);
  if (unavailable.length) throw new HttpError(409, 'Productos no disponibles', { products: unavailable });

  return items.map((i) => ({
    productId: i.productId,
    quantity:  i.quantity,
    notes:     i.notes || null,
    unitPrice: byId.get(i.productId)!.price,
  }));
};

// Suma cantidades por producto
export const sumByProduct = (items: { productId: string; quantity: number }[]) => {
  const totals = new Map<string, number>();
  for (const i of items) totals.set(i.productId, (totals.get(i.productId) ?? 0) + i.quantity);
  return totals;
};

// Al crear o agregar productos: verifica que haya stock para lo pedido más lo que ya tiene la orden.
// Solo aplica a productos con trackStock=true; el descuento real ocurre al cobrar.
export const assertStock = async (
  tx: Tx,
  newItems: { productId: string; quantity: number }[],
  orderId?: string,
) => {
  const existing = orderId
    ? await tx.orderItem.findMany({ where: { orderId }, select: { productId: true, quantity: true } })
    : [];
  const needed = sumByProduct([...existing, ...newItems.map((i) => ({ productId: i.productId, quantity: i.quantity }))]);
  const requestedIds = [...new Set(newItems.map((i) => i.productId))];

  const tracked = await tx.product.findMany({
    where:  { id: { in: requestedIds }, trackStock: true },
    select: { id: true, name: true, stock: true },
  });
  const insufficient = tracked.filter((p) => p.stock < (needed.get(p.id) ?? 0)).map((p) => p.name);
  if (insufficient.length) throw new HttpError(409, 'Stock insuficiente', { products: insufficient });
};

// Bloqueo de fila (SELECT ... FOR UPDATE) para serializar operaciones concurrentes
export const lockTable = async (tx: Tx, tableId: string) => {
  const rows = await tx.$queryRaw<{ id: string }[]>`SELECT id FROM "Table" WHERE id = ${tableId} FOR UPDATE`;
  if (rows.length === 0) throw new HttpError(404, 'Mesa no encontrada');
};

export const lockOrder = async (tx: Tx, orderId: string) => {
  const rows = await tx.$queryRaw<{ id: string }[]>`SELECT id FROM "Order" WHERE id = ${orderId} FOR UPDATE`;
  if (rows.length === 0) throw new HttpError(404, 'Orden no encontrada');
};

// Libera la mesa si estaba OCCUPIED y ya no le quedan órdenes activas
export const freeTableIfIdle = async (tx: Tx, tableId: string | null) => {
  if (!tableId) return null;
  const active = await tx.order.count({ where: { tableId, status: { in: ACTIVE_STATUSES } } });
  if (active > 0) return null;
  const table = await tx.table.findUnique({ where: { id: tableId } });
  if (!table || table.status !== 'OCCUPIED') return null;
  return tx.table.update({ where: { id: tableId }, data: { status: 'AVAILABLE' } });
};

export const assertActive = (status: OrderStatus) => {
  if (!ACTIVE_STATUSES.includes(status)) throw new HttpError(409, 'La orden ya no admite cambios');
};
