import { Request, Response } from 'express';
import { OrderStatus, Prisma } from '@prisma/client';
import { prisma } from '../lib/prisma';
import { HttpError, parse, sendError } from '../lib/http-error';
import { emit } from '../services/socket.service';
import {
  TX_OPTS, orderInclude, toOrderView,
  createOrderSchema, addItemsSchema, updateItemSchema, statusSchema, listQuerySchema,
  resolveItems, occupyTable, lockOrder, freeTableIfIdle, assertActive, assertStock, trackedProducts,
  deliveryEvent,
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
      const { items, tracked } = await resolveItems(tx, body.items);

      let table: Awaited<ReturnType<typeof occupyTable>>['table'] | null = null;
      if (body.type === 'DINE_IN') {
        const occupied = await occupyTable(tx, body.tableId!);
        table = occupied.table;
        const activeOrderId = occupied.activeOrderId;
        if (activeOrderId) {
          await assertStock(tx, items, tracked, activeOrderId);
          // Nueva ronda: vuelve a OPEN para que se envíe otra vez a cocina
          const order = await tx.order.update({
            where: { id: activeOrderId },
            data:  {
              status: 'OPEN',
              ...(body.customerName ? { customerName: body.customerName } : {}),
              items:  { createMany: { data: items } },
            },
            include: orderInclude,
          });
          return { order, created: false, table: null };
        }
      }

      await assertStock(tx, items, tracked);
      const order = await tx.order.create({
        data: {
          type:         body.type,
          tableId:      body.tableId ?? null,
          customerName: body.customerName ?? null,
          userId,
          items:        { createMany: { data: items } },
          // A domicilio: datos de entrega en la misma escritura (sin mesa)
          ...(body.type === 'DELIVERY' && body.delivery
            ? { delivery: { create: {
                phone:       body.delivery.phone,
                address:     body.delivery.address,
                reference:   body.delivery.reference ?? null,
                deliveryFee: body.delivery.deliveryFee,
              } } }
            : {}),
        },
        include: orderInclude,
      });
      return { order, created: true, table };
    }, TX_OPTS);

    const view = toOrderView(result.order);
    emit(result.created ? 'order:created' : 'order:updated', view);
    if (result.table) emit('table:updated', result.table);
    if (view.delivery) emit('delivery:updated', deliveryEvent(view));
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
      const locked = await lockOrder(tx, orderId);
      assertActive(locked.status);

      const { items, tracked } = await resolveItems(tx, body.items);
      await assertStock(tx, items, tracked, orderId);
      return tx.order.update({
        where:   { id: orderId },
        data:    { status: 'OPEN', items: { createMany: { data: items } } },
        include: orderInclude,
      });
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
  const locked = await lockOrder(tx, orderId);
  if (locked.status !== 'OPEN') {
    throw new HttpError(409, 'Solo se pueden modificar productos antes de enviar la orden a cocina');
  }
  const item = await tx.orderItem.findFirst({
    where:  { id: itemId, orderId },
    select: { productId: true, quantity: true, splitItems: { select: { quantity: true } } },
  });
  if (!item) throw new HttpError(404, 'Producto de la orden no encontrado');
  // Unidades ya cobradas en una cuenta: no se pueden quitar
  const assigned = item.splitItems.reduce((a, x) => a + x.quantity, 0);
  return { count: locked.itemCount, item, assigned };
};

// ── PATCH /api/orders/:id/items/:itemId ─────────────────────
export const updateItem = async (req: Request, res: Response) => {
  try {
    const orderId = String(req.params.id);
    const itemId  = String(req.params.itemId);
    const data    = parse(updateItemSchema, req.body);

    const order = await prisma.$transaction(async (tx) => {
      const { item, assigned } = await editableItem(tx, orderId, itemId);
      if (data.quantity !== undefined && data.quantity < assigned) {
        throw new HttpError(409, `Ya se cobraron ${assigned} unidades de este producto; no se puede bajar de ahí`);
      }
      // Si sube la cantidad, valida stock solo por la diferencia (lo actual ya cuenta en la orden)
      if (data.quantity && data.quantity > item.quantity) {
        const tracked = await trackedProducts(tx, [item.productId]);
        await assertStock(tx, [{ productId: item.productId, quantity: data.quantity - item.quantity }], tracked, orderId);
      }
      return tx.order.update({
        where:   { id: orderId },
        data:    { items: { update: { where: { id: itemId }, data } } },
        include: orderInclude,
      });
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
      const { count, assigned } = await editableItem(tx, orderId, itemId);
      if (assigned > 0) throw new HttpError(409, 'Este producto ya tiene unidades cobradas; no se puede eliminar');
      if (count <= 1) {
        throw new HttpError(409, 'La orden debe tener al menos un producto; cancélala si ya no se necesita');
      }
      return tx.order.update({
        where:   { id: orderId },
        data:    { items: { delete: { id: itemId } } },
        include: orderInclude,
      });
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
      const locked = await lockOrder(tx, orderId);

      if (status === 'CANCELLED' && locked.paid) {
        throw new HttpError(409, 'No se puede cancelar una orden pagada');
      }
      if (!TRANSITIONS[locked.status].includes(status)) {
        throw new HttpError(409, `Transición no permitida: ${locked.status} → ${status}`);
      }

      const cancel = status === 'CANCELLED';
      const order = await tx.order.update({
        where: { id: orderId },
        data:  {
          status,
          // Cancelar la orden es la única vía para cancelar su entrega (y exige que no esté pagada)
          ...(cancel && locked.deliveryId ? { delivery: { update: { status: 'CANCELLED' } } } : {}),
        },
        include: orderInclude,
      });
      const tables = cancel ? await freeTableIfIdle(tx, locked.tableId) : [];
      return { order, tables };
    }, TX_OPTS);

    const view = toOrderView(result.order);
    emit('order:updated', view);
    for (const t of result.tables) emit('table:updated', t);
    if (status === 'CANCELLED' && view.delivery) emit('delivery:updated', deliveryEvent(view));
    res.json(view);
  } catch (err) {
    sendError(res, err, 'updateStatus');
  }
};

// El cobro (POST /:id/payment y /:id/splits/pay) vive en payments.controller.ts

