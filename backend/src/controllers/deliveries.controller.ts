import { Request, Response } from 'express';
import { z } from 'zod';
import { DeliveryStatus, Prisma } from '@prisma/client';
import { prisma } from '../lib/prisma';
import { HttpError, parse, sendError } from '../lib/http-error';
import { ymd, withRangeRules } from '../lib/dateSchemas';
import { addDays, mazatlanDayStart } from '../lib/mazatlan';
import { emit } from '../services/socket.service';
import { TX_OPTS, orderInclude, toOrderView, deliveryEvent } from './orders.helpers';

// Transiciones de la entrega. CANCELLED no se pide aquí: solo llega al cancelar la orden (sin pago).
const NEXT: Partial<Record<DeliveryStatus, DeliveryStatus>> = {
  PENDING:    'IN_TRANSIT',
  IN_TRANSIT: 'DELIVERED',
};

const listSchema = withRangeRules(z.object({
  from:   ymd,
  to:     ymd,
  status: z.string().optional()
    .transform((s) => (s ? s.split(',').map((v) => v.trim()) : undefined))
    .pipe(z.array(z.enum(DeliveryStatus)).optional()),
  limit:  z.coerce.number().int().min(1).max(200).default(100),
  offset: z.coerce.number().int().min(0).default(0),
}));

const statusSchema = z.object({
  status:     z.enum(['IN_TRANSIT', 'DELIVERED']),
  driverName: z.string().trim().max(80).optional().transform((s) => (s ? s : undefined)),
}).refine((d) => d.status !== 'IN_TRANSIT' || d.driverName, {
  message: 'Indica el repartidor para enviar la entrega', path: ['driverName'],
});

const withOrder = { order: { include: orderInclude } } as const;
type DeliveryWithOrder = Prisma.DeliveryGetPayload<{ include: typeof withOrder }>;

const toView = (d: DeliveryWithOrder) => {
  const order = toOrderView(d.order);
  return {
    id:          d.id,
    status:      d.status,
    phone:       d.phone,
    address:     d.address,
    reference:   d.reference,
    deliveryFee: d.deliveryFee.toFixed(2),
    driverName:  d.driverName,
    createdAt:   d.createdAt,
    inTransitAt: d.inTransitAt,
    deliveredAt: d.deliveredAt,
    order: {
      id:           order.id,
      ticketNumber: order.ticketNumber,
      status:       order.status,
      customerName: order.customerName,
      itemsTotal:   order.itemsTotal,
      total:        order.total,
      paid:         order.status === 'PAID',
      paymentMethod: order.payment?.method ?? null,
      items:        order.items.map((i) => ({ id: i.id, quantity: i.quantity, name: i.product.name })),
    },
  };
};

// ── GET /api/deliveries?from&to&status&limit&offset ─────────
// Fecha = día (Mazatlán) en que se creó la orden a domicilio
export const listDeliveries = async (req: Request, res: Response) => {
  try {
    const q = parse(listSchema, req.query);
    const where: Prisma.DeliveryWhereInput = {
      createdAt: { gte: mazatlanDayStart(q.from), lt: mazatlanDayStart(addDays(q.to, 1)) },
      ...(q.status ? { status: { in: q.status } } : {}),
    };
    const [items, count] = await Promise.all([
      prisma.delivery.findMany({ where, include: withOrder, orderBy: { createdAt: 'desc' }, take: q.limit, skip: q.offset }),
      prisma.delivery.count({ where }),
    ]);
    res.json({ items: items.map(toView), count, limit: q.limit, offset: q.offset });
  } catch (err) {
    sendError(res, err, 'listDeliveries');
  }
};

// ── PATCH /api/deliveries/:id/status ────────────────────────
export const updateDeliveryStatus = async (req: Request, res: Response) => {
  try {
    const id   = String(req.params.id);
    const body = parse(statusSchema, req.body);

    const updated = await prisma.$transaction(async (tx) => {
      // Bloqueo de la fila para serializar cambios simultáneos
      const rows = await tx.$queryRaw<{ status: DeliveryStatus }[]>`
        SELECT status::text AS status FROM "Delivery" WHERE id = ${id} FOR UPDATE`;
      if (rows.length === 0) throw new HttpError(404, 'Entrega no encontrada');
      const current = rows[0].status;
      if (NEXT[current] !== body.status) {
        throw new HttpError(409, `Transición no permitida: ${current} → ${body.status}`);
      }
      return tx.delivery.update({
        where: { id },
        data:  body.status === 'IN_TRANSIT'
          ? { status: 'IN_TRANSIT', driverName: body.driverName, inTransitAt: new Date() }
          : { status: 'DELIVERED', deliveredAt: new Date() },
        include: withOrder,
      });
    }, TX_OPTS);

    const view = toView(updated);
    emit('delivery:updated', deliveryEvent({ ...updated.order, delivery: updated }));
    res.json(view);
  } catch (err) {
    sendError(res, err, 'updateDeliveryStatus');
  }
};
