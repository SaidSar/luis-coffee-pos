import { Request, Response } from 'express';
import { z } from 'zod';
import { Prisma, PaymentMethod } from '@prisma/client';
import { prisma } from '../lib/prisma';
import { HttpError, parse, sendError } from '../lib/http-error';
import { emit } from '../services/socket.service';
import {
  TX_OPTS, orderInclude, toOrderView, lockOrder, freeTableIfIdle, decrementStock, deliveryEvent,
  paymentSchema, splitPaySchema, paymentLineSchema,
} from './orders.helpers';

type Tx = Prisma.TransactionClient;
type PaymentLine = z.infer<typeof paymentLineSchema>;
const ZERO = new Prisma.Decimal(0);
const fx = (d: Prisma.Decimal) => d.toFixed(2);

// Qué se cobra: unidades elegidas, o todo lo que aún no está en ninguna cuenta
type Selection = { kind: 'items'; items: { orderItemId: string; quantity: number }[] } | { kind: 'all' };
// Cómo se paga: líneas explícitas, o el cuerpo anterior {method, amountReceived} aplicado al total de la cuenta
type Payer = { kind: 'lines'; lines: PaymentLine[] } | { kind: 'legacy'; method: PaymentMethod; amountReceived: Prisma.Decimal };

// Convierte las líneas de pago en pagos a registrar. La suma debe ser exactamente el monto de la cuenta;
// efectivo exige recibido >= su porción y calcula el cambio; tarjeta y transferencia pagan exacto.
const buildPayments = (amount: Prisma.Decimal, payer: Payer) => {
  if (payer.kind === 'legacy') {
    if (payer.method === 'CASH') {
      if (payer.amountReceived.lt(amount)) throw new HttpError(400, 'El monto recibido es menor al total', { total: fx(amount) });
      return [{ method: payer.method, amount, amountReceived: payer.amountReceived, changeGiven: payer.amountReceived.sub(amount) }];
    }
    if (!payer.amountReceived.eq(amount)) {
      throw new HttpError(400, 'Con tarjeta o transferencia el monto debe ser igual al total', { total: fx(amount) });
    }
    return [{ method: payer.method, amount, amountReceived: null, changeGiven: null }];
  }

  const sum = payer.lines.reduce((a, l) => a.add(l.amount), ZERO);
  if (!sum.eq(amount)) {
    throw new HttpError(400, sum.lt(amount) ? 'Los pagos no cubren el monto de la cuenta' : 'Los pagos exceden el monto de la cuenta',
      { amount: fx(amount), paid: fx(sum) });
  }
  return payer.lines.map((l, idx) => {
    if (l.method !== 'CASH') {
      if (l.amountReceived && !l.amountReceived.eq(l.amount)) {
        throw new HttpError(400, 'Con tarjeta o transferencia se cobra el monto exacto', { line: idx });
      }
      return { method: l.method, amount: l.amount, amountReceived: null, changeGiven: null };
    }
    if (!l.amountReceived) throw new HttpError(400, 'Indica el monto recibido en efectivo', { line: idx });
    if (l.amountReceived.lt(l.amount)) {
      throw new HttpError(400, 'El efectivo recibido es menor a su porción', { line: idx, amount: fx(l.amount) });
    }
    return { method: l.method, amount: l.amount, amountReceived: l.amountReceived, changeGiven: l.amountReceived.sub(l.amount) };
  });
};

// Cobra una cuenta en una transacción con la orden bloqueada (FOR UPDATE).
// Si ya no quedan unidades sin cuenta, la orden pasa a PAID, fija paidAt y libera la mesa y su grupo.
export const paySplit = async (tx: Tx, orderId: string, userId: string, sel: Selection, payer: Payer, label?: string) => {
  const locked = await lockOrder(tx, orderId);
  if (locked.status === 'PAID')      throw new HttpError(409, 'La orden ya fue pagada');
  if (locked.status === 'CANCELLED') throw new HttpError(409, 'La orden está cancelada');
  if (locked.itemCount === 0)        throw new HttpError(409, 'La orden no tiene productos');
  // A domicilio se cobra completo (el cargo de envío no se reparte)
  if (locked.deliveryId && sel.kind === 'items') throw new HttpError(400, 'Las órdenes a domicilio se cobran completas');

  const items = await tx.orderItem.findMany({
    where:  { orderId },
    select: {
      id: true, productId: true, quantity: true, unitPrice: true,
      product:    { select: { name: true, trackStock: true } },
      splitItems: { select: { quantity: true } },
    },
  });
  const remaining = new Map(items.map((i) => [i.id, i.quantity - i.splitItems.reduce((a, x) => a + x.quantity, 0)]));

  let chosen: { item: (typeof items)[number]; quantity: number }[];
  if (sel.kind === 'all') {
    chosen = items.filter((i) => remaining.get(i.id)! > 0).map((i) => ({ item: i, quantity: remaining.get(i.id)! }));
    if (chosen.length === 0) throw new HttpError(409, 'No hay productos pendientes de cobro');
  } else {
    const byId = new Map(items.map((i) => [i.id, i]));
    const unknown = sel.items.filter((x) => !byId.has(x.orderItemId));
    if (unknown.length) throw new HttpError(400, 'Hay productos que no pertenecen a esta orden');
    const over = sel.items.filter((x) => x.quantity > remaining.get(x.orderItemId)!);
    if (over.length) {
      throw new HttpError(409, 'Esas cantidades ya no están pendientes de cobro', {
        products: over.map((x) => byId.get(x.orderItemId)!.product.name),
        remaining: over.map((x) => ({ orderItemId: x.orderItemId, remaining: remaining.get(x.orderItemId) })),
      });
    }
    chosen = sel.items.map((x) => ({ item: byId.get(x.orderItemId)!, quantity: x.quantity }));
  }

  // Monto de la cuenta: precio congelado × unidades (+ cargo de envío en la cuenta única de una entrega)
  let amount = chosen.reduce((a, c) => a.add(c.item.unitPrice.mul(c.quantity)), ZERO);
  if (locked.deliveryId) amount = amount.add(locked.deliveryFee);
  const payments = buildPayments(amount, payer);

  // Stock: solo de lo que se cobra en esta cuenta (si falta, 409 con nombres y se revierte todo)
  await decrementStock(tx, chosen.map((c) => ({ productId: c.item.productId, quantity: c.quantity, product: c.item.product })));

  const split = await tx.orderSplit.create({
    data: {
      orderId, label: label ?? null, amount, createdById: userId,
      items: { createMany: { data: chosen.map((c) => ({ orderItemId: c.item.id, quantity: c.quantity })) } },
    },
  });
  await tx.payment.createMany({ data: payments.map((p) => ({ ...p, orderId, splitId: split.id })) });

  const pendingAfter = items.some((i) => {
    const used = chosen.find((c) => c.item.id === i.id)?.quantity ?? 0;
    return remaining.get(i.id)! - used > 0;
  });
  let tables: Awaited<ReturnType<typeof freeTableIfIdle>> = [];
  if (!pendingAfter) {
    await tx.order.update({ where: { id: orderId }, data: { status: 'PAID', paidAt: new Date() } });
    tables = await freeTableIfIdle(tx, locked.tableId);
  }
  const order = await tx.order.findUniqueOrThrow({ where: { id: orderId }, include: orderInclude });
  return { order, tables, completed: !pendingAfter, splitId: split.id };
};

const respond = (res: Response, r: Awaited<ReturnType<typeof paySplit>>) => {
  const view = toOrderView(r.order);
  emit(r.completed ? 'order:paid' : 'order:updated', view);
  for (const t of r.tables) emit('table:updated', t);
  if (view.delivery) emit('delivery:updated', deliveryEvent(view));
  res.status(201).json({ ...view, lastSplitId: r.splitId });
};

// ── POST /api/orders/:id/splits/pay ─────────────────────────
export const paySplitHandler = async (req: Request, res: Response) => {
  try {
    const orderId = String(req.params.id);
    const body = parse(splitPaySchema, req.body);
    const r = await prisma.$transaction(
      (tx) => paySplit(tx, orderId, req.user!.id, { kind: 'items', items: body.items }, { kind: 'lines', lines: body.payments }, body.label),
      TX_OPTS,
    );
    respond(res, r);
  } catch (err) {
    sendError(res, err, 'paySplit');
  }
};

// ── POST /api/orders/:id/payment (cobrar todo; compatible con el cuerpo anterior) ──
export const payOrder = async (req: Request, res: Response) => {
  try {
    const orderId = String(req.params.id);
    const body = parse(paymentSchema, req.body);
    const payer: Payer = 'payments' in body
      ? { kind: 'lines', lines: body.payments }
      : { kind: 'legacy', method: body.method, amountReceived: body.amountReceived };
    const r = await prisma.$transaction((tx) => paySplit(tx, orderId, req.user!.id, { kind: 'all' }, payer), TX_OPTS);
    respond(res, r);
  } catch (err) {
    sendError(res, err, 'payOrder');
  }
};
