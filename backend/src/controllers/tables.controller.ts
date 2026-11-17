import { Request, Response } from 'express';
import { z } from 'zod';
import { TableStatus } from '@prisma/client';
import { prisma } from '../lib/prisma';
import { HttpError, parse, sendError } from '../lib/http-error';
import { emit } from '../services/socket.service';
import { ACTIVE_STATUSES } from './orders.helpers';

const createTableSchema = z.object({
  number:   z.number().int().positive(),
  capacity: z.number().int().min(1).max(50),
});

const updateTableSchema = z
  .object({
    number:   z.number().int().positive(),
    capacity: z.number().int().min(1).max(50),
    status:   z.enum(TableStatus),
  })
  .partial()
  .refine((d) => Object.keys(d).length > 0, { message: 'Indica al menos un campo' });

// Mesas con su orden activa (si la hay), para que el POS sepa qué mesa está ocupada
const tableInclude = {
  orders: {
    where:  { status: { in: ACTIVE_STATUSES } },
    select: { id: true, ticketNumber: true, status: true },
  },
} as const;

// ── GET /api/tables ─────────────────────────────────────────
export const getTables = async (_: Request, res: Response) => {
  try {
    const tables = await prisma.table.findMany({ include: tableInclude, orderBy: { number: 'asc' } });
    res.json(tables.map(({ orders, ...t }) => ({ ...t, activeOrder: orders[0] ?? null })));
  } catch (err) {
    sendError(res, err, 'getTables');
  }
};

// ── POST /api/tables ────────────────────────────────────────
export const createTable = async (req: Request, res: Response) => {
  try {
    const data = parse(createTableSchema, req.body);
    const table = await prisma.table.create({ data });
    emit('table:updated', table);
    res.status(201).json(table);
  } catch (err) {
    sendError(res, err, 'createTable');
  }
};

// ── PATCH /api/tables/:id ───────────────────────────────────
export const updateTable = async (req: Request, res: Response) => {
  try {
    const id   = String(req.params.id);
    const data = parse(updateTableSchema, req.body);

    const table = await prisma.$transaction(async (tx) => {
      const current = await tx.table.findUnique({
        where:   { id },
        include: { orders: { where: { status: { in: ACTIVE_STATUSES } }, select: { id: true } } },
      });
      if (!current) throw new HttpError(404, 'Mesa no encontrada');

      // Con una orden activa la mesa debe seguir OCCUPIED: se libera al pagar o cancelar
      if (data.status && data.status !== 'OCCUPIED' && current.orders.length > 0) {
        throw new HttpError(409, 'La mesa tiene una orden activa');
      }
      return tx.table.update({ where: { id }, data });
    });

    emit('table:updated', table);
    res.json(table);
  } catch (err) {
    sendError(res, err, 'updateTable');
  }
};
