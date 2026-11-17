import { Request, Response } from 'express';
import { OrderStatus, Prisma } from '@prisma/client';
import { prisma } from '../lib/prisma';
import { HttpError, parse, sendError } from '../lib/http-error';
import { emit } from '../services/socket.service';
import {
  ACTIVE_STATUSES, TX_OPTS, orderInclude, toOrderView, orderTotal,
  createOrderSchema, addItemsSchema, updateItemSchema, statusSchema, paymentSchema, listQuerySchema,
  resolveItems, lockTable, lockOrder, freeTableIfIdle, assertActive,
} from './orders.helpers';

// Transiciones permitidas. CANCELLED además exige que no exista Payment y rol ADMIN o CASHIER.
const TRANSITIONS: Record<OrderStatus, OrderStatus[]> = {
  OPEN:       ['IN_KITCHEN', 'CANCELLED'],
  IN_KITCHEN: ['SERVED', 'CANCELLED'],
  SERVED:     ['CANCELLED'],
  PAID:       [],
  CANCELLED:  [],
};

// ── GET /api/orders?status=OPEN,IN_KITCHEN ──────────────────
export const getOrders = async (req: Request, res: Response) => {
  try {
    const { status } = parse(listQuerySchema, req.query);
    const orders = await prisma.order.findMany({
      where:   status ? { status: { in: status } } : undefined,
      include: orderInclude,
      orderBy: { createdAt: 'desc' },
      take:    200,
    });
    res.json(orders.map(toOrderView));
  } catch (err) {
    sendError(res, err, 'getOrders');
  }
};

// ── GET /api/orders/:id ─────────────────────────────────────
export const getOrder = async (req: Request, res: Response) => {
  try {
    const order = await prisma.order.findUnique({ where: { id: String(req.params.id) }, include: orderInclude });
    if (!order) throw new HttpError(404, 'Orden no encontrada');
    res.json(toOrderView(order));
  } catch (err) {
    sendError(res, err, 'getOrder');
  }
};

// ── POST /api/orders ────────────────────────────────────────
// DINE_IN: si la mesa ya tiene una orden activa, los productos se agregan a esa orden (200).
export const createOrder = async (req: Request, res: Response) => {
  try {
    const body   = parse(createOrderSchema, req.body);
    const userId = req.user!.id;

    const result = await prisma.$transaction(async (tx) => {
      const items = await resolveItems(tx, body.items);

      if (body.type === 'DINE_IN') {
        await lockTable(tx, body.tableId!);
        const active = await tx.order.findFirst({
          where:  { tableId: body.tableId, status: { in: ACTIVE_STATUSES } },
          select: { id: true },
        });
        if (active) {
          await tx.orderItem.createMany({ data: items.map((i) => ({ ...i, orderId: active.id })) });
          const order = await tx.order.update({
            where:   { id: active.id },
            // Nueva ronda: vuelve a OPEN para que se envíe otra vez a cocina
            data:    { status: 'OPEN', ...(body.customerName ? { customerName: body.customerName } : {}) },
            include: orderInclude,
          });
          return { order, created: false, table: null };
        }
      }

      const order = await tx.order.create({
        data: {
          type:         body.type,
          tableId:      body.tableId ?? null,
          customerName: body.customerName ?? null,
          userId,
          items:        { create: items },
        },
        include: orderInclude,
      });
      const table = body.tableId
        ? await tx.table.update({ where: { id: body.tableId }, data: { status: 'OCCUPIED' } })
        : null;
      return { order, created: true, table };
    }, TX_OPTS);

    const view = toOrderView(result.order);
    emit(result.created ? 'order:created' : 'order:updated', view);
    if (result.table) emit('table:updated', result.table);
    res.status(result.created ? 201 : 200).json(view);
  } catch (err) {
    sendError(res, err, 'createOrder');
  }
};

// ── POST /api/orders/:id/items  (nueva ronda) ───────────────
export const addItems = async (req: Request, res: Response) => {
  try {
    const orderId = String(req.params.id);
    const body    = parse(addItemsSchema, req.body);

    const order = await prisma.$transaction(async (tx) => {
      await lockOrder(tx, orderId);
      const current = await tx.order.findUniqueOrThrow({ where: { id: orderId }, select: { status: true } });
      assertActive(current.status);

      const items = await resolveItems(tx, body.items);
      await tx.orderItem.createMany({ data: items.map((i) => ({ ...i, orderId })) });
      return tx.order.update({ where: { id: orderId }, data: { status: 'OPEN' }, include: orderInclude });
    }, TX_OPTS);

    const view = toOrderView(order);
    emit('order:updated', view);
    res.status(201).json(view);
  } catch (err) {
    sendError(res, err, 'addItems');
  }
};

// Cambios a productos ya pedidos: solo mientras la orden está OPEN (aún no enviada a cocina)
const editableItem = async (tx: Prisma.TransactionClient, orderId: string, itemId: string) => {
  await lockOrder(tx, orderId);
  const order = await tx.order.findUniqueOrThrow({
    where:  { id: orderId },
    select: { status: true, _count: { select: { items: true } } },
  });
  if (order.status !== 'OPEN') {
    throw new HttpError(409, 'Solo se pueden modificar productos antes de enviar la orden a cocina');
  }
  const item = await tx.orderItem.findFirst({ where: { id: itemId, orderId }, select: { id: true } });
  if (!item) throw new HttpError(404, 'Producto de la orden no encontrado');
  return order._count.items;
};

// ── PATCH /api/orders/:id/items/:itemId ─────────────────────
export const updateItem = async (req: Request, res: Response) => {
  try {
    const orderId = String(req.params.id);
    const itemId  = String(req.params.itemId);
    const data    = parse(updateItemSchema, req.body);

    const order = await prisma.$transaction(async (tx) => {
      await editableItem(tx, orderId, itemId);
      await tx.orderItem.update({ where: { id: itemId }, data });
      return tx.order.findUniqueOrThrow({ where: { id: orderId }, include: orderInclude });
    }, TX_OPTS);

    const view = toOrderView(order);
    emit('order:updated', view);
    res.json(view);
  } catch (err) {
    sendError(res, err, 'updateItem');
  }
};

// ── DELETE /api/orders/:id/items/:itemId ────────────────────
export const deleteItem = async (req: Request, res: Response) => {
  try {
    const orderId = String(req.params.id);
    const itemId  = String(req.params.itemId);

    const order = await prisma.$transaction(async (tx) => {
      const count = await editableItem(tx, orderId, itemId);
      if (count <= 1) {
        throw new HttpError(409, 'La orden debe tener al menos un producto; cancélala si ya no se necesita');
      }
      await tx.orderItem.delete({ where: { id: itemId } });
      return tx.order.findUniqueOrThrow({ where: { id: orderId }, include: orderInclude });
    }, TX_OPTS);

    const view = toOrderView(order);
    emit('order:updated', view);
    res.json(view);
  } catch (err) {
    sendError(res, err, 'deleteItem');
  }
};

// ── PATCH /api/orders/:id/status ────────────────────────────
export const updateStatus = async (req: Request, res: Response) => {
  try {
    const orderId    = String(req.params.id);
    const { status } = parse(statusSchema, req.body);

    if (status === 'CANCELLED' && !['ADMIN', 'CASHIER'].includes(req.user!.role)) {
      throw new HttpError(403, 'Sin permisos para cancelar órdenes');
    }

    const result = await prisma.$transaction(async (tx) => {
      await lockOrder(tx, orderId);
      const current = await tx.order.findUniqueOrThrow({
        where:  { id: orderId },
        select: { status: true, tableId: true, payment: { select: { id: true } } },
      });

      if (status === 'CANCELLED' && current.payment) {
        throw new HttpError(409, 'No se puede cancelar una orden pagada');
      }
      if (!TRANSITIONS[current.status].includes(status)) {
        throw new HttpError(409, `Transición no permitida: ${current.status} → ${status}`);
      }

      const order = await tx.order.update({ where: { id: orderId }, data: { status }, include: orderInclude });
      const table = status === 'CANCELLED' ? await freeTableIfIdle(tx, current.tableId) : null;
      return { order, table };
    }, TX_OPTS);

    const view = toOrderView(result.order);
    emit('order:updated', view);
    if (result.table) emit('table:updated', result.table);
    res.json(view);
  } catch (err) {
    sendError(res, err, 'updateStatus');
  }
};

// ── POST /api/orders/:id/payment ────────────────────────────
// Todo en una transacción: valida monto, descuenta stock, crea Payment, orden → PAID y libera mesa.
export const payOrder = async (req: Request, res: Response) => {
  try {
    const orderId                    = String(req.params.id);
    const { method, amountReceived } = parse(paymentSchema, req.body);

    const result = await prisma.$transaction(async (tx) => {
      await lockOrder(tx, orderId);
      const order = await tx.order.findUniqueOrThrow({
        where:  { id: orderId },
        select: {
          status:  true,
          tableId: true,
          payment: { select: { id: true } },
          items:   { select: { productId: true, quantity: true, unitPrice: true, product: { select: { name: true } } } },
        },
      });

      if (order.payment || order.status === 'PAID') throw new HttpError(409, 'La orden ya fue pagada');
      if (order.status === 'CANCELLED')              throw new HttpError(409, 'La orden está cancelada');
      if (order.items.length === 0)                  throw new HttpError(409, 'La orden no tiene productos');

      const total = orderTotal(order.items);
      let changeGiven: Prisma.Decimal | null = null;

      if (method === 'CASH') {
        if (amountReceived.lt(total)) {
          throw new HttpError(400, 'El monto recibido es menor al total', { total: total.toFixed(2) });
        }
        changeGiven = amountReceived.sub(total);
      } else if (!amountReceived.eq(total)) {
        throw new HttpError(400, 'Con tarjeta o transferencia el monto debe ser igual al total', { total: total.toFixed(2) });
      }

      // Descuento condicional de stock: si algún producto no alcanza, se revierte toda la transacción
      const needed = new Map<string, { name: string; quantity: number }>();
      for (const i of order.items) {
        const prev = needed.get(i.productId);
        needed.set(i.productId, { name: i.product.name, quantity: (prev?.quantity ?? 0) + i.quantity });
      }
      const insufficient: string[] = [];
      for (const [productId, { name, quantity }] of needed) {
        const { count } = await tx.product.updateMany({
          where: { id: productId, stock: { gte: quantity } },
          data:  { stock: { decrement: quantity } },
        });
        if (count === 0) insufficient.push(name);
      }
      if (insufficient.length) throw new HttpError(409, 'Stock insuficiente', { products: insufficient });

      await tx.payment.create({ data: { orderId, method, amount: total, changeGiven } });
      const updated = await tx.order.update({ where: { id: orderId }, data: { status: 'PAID' }, include: orderInclude });
      const table   = await freeTableIfIdle(tx, order.tableId);
      return { order: updated, table };
    }, TX_OPTS);

    const view = toOrderView(result.order);
    emit('order:paid', view);
    if (result.table) emit('table:updated', result.table);
    res.status(201).json(view);
  } catch (err) {
    // Carrera entre dos cobros simultáneos: la restricción única de Payment.orderId lo detiene
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
      return sendError(res, new HttpError(409, 'La orden ya fue pagada'), 'payOrder');
    }
    sendError(res, err, 'payOrder');
  }
};
