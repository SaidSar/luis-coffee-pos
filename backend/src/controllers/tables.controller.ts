import { Request, Response } from 'express';
import { z } from 'zod';
import { Prisma } from '@prisma/client';
import { prisma } from '../lib/prisma';
import { HttpError, parse, sendError } from '../lib/http-error';
import { emit } from '../services/socket.service';
import { ACTIVE_STATUSES, TX_OPTS, type TableEvent } from './orders.helpers';

type Tx = Prisma.TransactionClient;

// ── Schemas ──────────────────────────────────────────────────
const number   = z.number({ message: 'Número de mesa inválido' }).int().positive().max(9999);
const capacity = z.number({ message: 'Capacidad inválida' }).int().min(1, { message: 'Mínimo 1 persona' }).max(50, { message: 'Máximo 50 personas' });

// number opcional: si no viene se usa el siguiente consecutivo
const createTableSchema = z.object({ number: number.optional(), capacity: capacity.default(4) });

const updateTableSchema = z
  .object({
    number,
    capacity,
    active: z.boolean({ message: 'Indica sí o no' }),
    // Estados manuales; OCCUPIED y MERGED los gestiona el sistema (órdenes y uniones)
    status: z.enum(['AVAILABLE', 'RESERVED', 'CLEANING']),
  })
  .partial()
  .refine((d) => Object.keys(d).length > 0, { message: 'Indica al menos un campo' });

// Mesas a unir: números de mesa (o ids), sin repetir
const mergeSchema = z.object({
  tableIds: z.array(z.union([number, z.string().uuid({ message: 'Mesa inválida' })]), { message: 'Indica las mesas a unir' })
    .min(1, { message: 'Indica al menos una mesa' }).max(20, { message: 'Máximo 20 mesas' })
    .refine((a) => new Set(a.map(String)).size === a.length, { message: 'Hay mesas repetidas' }),
});

const listSchema = z.object({ includeInactive: z.enum(['true', 'false']).optional() });

// ── Vista ────────────────────────────────────────────────────
const tableInclude = {
  orders:       { where: { status: { in: ACTIVE_STATUSES } }, select: { id: true, ticketNumber: true, status: true } },
  mergedInto:   { select: { number: true } },
  mergedTables: { select: { number: true }, orderBy: { number: 'asc' } },
} as const;
type TableWithRefs = Prisma.TableGetPayload<{ include: typeof tableInclude }>;

const toView = ({ orders, mergedInto, mergedTables, ...t }: TableWithRefs) => ({
  ...t,
  activeOrder:      orders[0] ?? null,
  mergedIntoNumber: mergedInto?.number ?? null,
  mergedNumbers:    mergedTables.map((m) => m.number), // en la principal: números de sus secundarias
});

const toEvent = (t: TableEvent | (Omit<TableEvent, 'status'> & { status: string })): TableEvent => ({
  id: t.id, number: t.number, capacity: t.capacity, status: t.status, active: t.active, mergedIntoId: t.mergedIntoId,
});

// Bloquea filas de mesa en orden de id (evita interbloqueos entre uniones simultáneas)
const lockTables = (tx: Tx, ids: string[]) => tx.$queryRaw<{ id: string }[]>`
  SELECT id FROM "Table" WHERE id IN (${Prisma.join(ids)}) ORDER BY id FOR UPDATE`;

const activeOrderCount = (tx: Tx, tableId: string) =>
  tx.order.count({ where: { tableId, status: { in: ACTIVE_STATUSES } } });

// ── GET /api/tables?includeInactive=true ─────────────────────
// Por defecto solo activas; las inactivas solo las pide ADMIN
export const getTables = async (req: Request, res: Response) => {
  try {
    const q = parse(listSchema, req.query);
    const includeInactive = q.includeInactive === 'true';
    if (includeInactive && req.user!.role !== 'ADMIN') throw new HttpError(403, 'Solo un administrador puede ver las mesas desactivadas');
    const tables = await prisma.table.findMany({
      where:   includeInactive ? {} : { active: true },
      include: tableInclude,
      orderBy: { number: 'asc' },
    });
    res.json(tables.map(toView));
  } catch (err) {
    sendError(res, err, 'getTables');
  }
};

// ── POST /api/tables (ADMIN) ─────────────────────────────────
export const createTable = async (req: Request, res: Response) => {
  try {
    const body = parse(createTableSchema, req.body);
    const table = await prisma.$transaction(async (tx) => {
      let num = body.number;
      if (num === undefined) {
        // Siguiente consecutivo (cuenta también las desactivadas: el número es único)
        const max = await tx.table.aggregate({ _max: { number: true } });
        num = (max._max.number ?? 0) + 1;
      } else if (await tx.table.findUnique({ where: { number: num }, select: { id: true } })) {
        throw new HttpError(409, `Ya existe la mesa ${num}`);
      }
      return tx.table.create({ data: { number: num, capacity: body.capacity }, include: tableInclude });
    }, TX_OPTS);
    emit('table:updated', toEvent(table));
    res.status(201).json(toView(table));
  } catch (err) {
    // Dos altas simultáneas con el mismo consecutivo: la restricción única lo detiene
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
      return sendError(res, new HttpError(409, 'Ese número de mesa ya existe; intenta de nuevo'), 'createTable');
    }
    sendError(res, err, 'createTable');
  }
};

// ── PATCH /api/tables/:id (ADMIN) ────────────────────────────
export const updateTable = async (req: Request, res: Response) => {
  try {
    const id   = String(req.params.id);
    const data = parse(updateTableSchema, req.body);

    const table = await prisma.$transaction(async (tx) => {
      await lockTables(tx, [id]);
      const cur = await tx.table.findUnique({ where: { id }, include: { mergedTables: { select: { id: true } } } });
      if (!cur) throw new HttpError(404, 'Mesa no encontrada');
      const inGroup = !!cur.mergedIntoId || cur.mergedTables.length > 0;
      const busy = await activeOrderCount(tx, id);

      if (data.active === false && cur.active) {
        if (busy > 0)                  throw new HttpError(409, `La mesa ${cur.number} tiene una orden activa; no se puede desactivar`);
        if (inGroup)                   throw new HttpError(409, `La mesa ${cur.number} está unida a otras; sepárala antes de desactivarla`);
        if (cur.status !== 'AVAILABLE') throw new HttpError(409, `La mesa ${cur.number} no está libre; no se puede desactivar`);
      }
      if (data.status) {
        if (busy > 0) throw new HttpError(409, 'La mesa tiene una orden activa');
        if (inGroup)  throw new HttpError(409, 'La mesa está unida a otras; sepárala antes de cambiar su estado');
      }
      if (data.number !== undefined && data.number !== cur.number
          && await tx.table.findUnique({ where: { number: data.number }, select: { id: true } })) {
        throw new HttpError(409, `Ya existe la mesa ${data.number}`);
      }
      return tx.table.update({
        where: { id },
        // Reactivar la deja libre
        data:  { ...data, ...(data.active === true && !cur.active ? { status: 'AVAILABLE' as const } : {}) },
        include: tableInclude,
      });
    }, TX_OPTS);

    emit('table:updated', toEvent(table));
    res.json(toView(table));
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
      return sendError(res, new HttpError(409, 'Ese número de mesa ya existe'), 'updateTable');
    }
    sendError(res, err, 'updateTable');
  }
};

// ── POST /api/tables/:id/merge (WAITER, CASHIER, ADMIN) ──────
// :id es la principal (libre u ocupada). Las mesas unidas deben estar libres, activas y fuera de cualquier grupo.
export const mergeTables = async (req: Request, res: Response) => {
  try {
    const id = String(req.params.id);
    const { tableIds } = parse(mergeSchema, req.body);

    const affected = await prisma.$transaction(async (tx) => {
      const principal = await tx.table.findUnique({ where: { id } });
      if (!principal) throw new HttpError(404, 'Mesa principal no encontrada');

      const numbers = tableIds.filter((v): v is number => typeof v === 'number');
      const ids     = tableIds.filter((v): v is string => typeof v === 'string');
      const others  = await tx.table.findMany({ where: { OR: [{ number: { in: numbers } }, { id: { in: ids } }] } });
      const missing = [...numbers.filter((n) => !others.some((o) => o.number === n)), ...ids.filter((i) => !others.some((o) => o.id === i))];
      if (missing.length) throw new HttpError(404, `No existen las mesas: ${missing.join(', ')}`);
      if (others.some((o) => o.id === principal.id)) throw new HttpError(409, 'Una mesa no se puede unir consigo misma');

      await lockTables(tx, [principal.id, ...others.map((o) => o.id)]);
      // Releer ya con el candado (el estado pudo cambiar entre la lectura y el bloqueo)
      const fresh = await tx.table.findMany({
        where:   { id: { in: [principal.id, ...others.map((o) => o.id)] } },
        include: { mergedTables: { select: { id: true } }, mergedInto: { select: { number: true } } },
      });
      const p = fresh.find((t) => t.id === principal.id)!;
      if (!p.active) throw new HttpError(409, `La mesa ${p.number} está desactivada`);
      // Una secundaria no puede ser principal (así no se forman cadenas ni ciclos)
      if (p.mergedIntoId) throw new HttpError(409, `La mesa ${p.number} ya está unida a la mesa ${p.mergedInto?.number}`);
      if (p.status !== 'AVAILABLE' && p.status !== 'OCCUPIED') throw new HttpError(409, `La mesa ${p.number} debe estar libre u ocupada para ser principal`);

      const problems: string[] = [];
      for (const o of fresh.filter((t) => t.id !== p.id)) {
        if (!o.active) problems.push(`mesa ${o.number} desactivada`);
        else if (o.mergedIntoId) problems.push(`mesa ${o.number} ya unida a la mesa ${o.mergedInto?.number}`);
        else if (o.mergedTables.length) problems.push(`mesa ${o.number} es principal de otro grupo`);
        else if (await activeOrderCount(tx, o.id) > 0) problems.push(`mesa ${o.number} tiene una orden activa`);
        else if (o.status !== 'AVAILABLE') problems.push(`mesa ${o.number} no está libre`);
      }
      if (problems.length) throw new HttpError(409, `No se pueden unir: ${problems.join('; ')}`, { tables: problems });

      await tx.table.updateMany({ where: { id: { in: others.map((o) => o.id) } }, data: { status: 'MERGED', mergedIntoId: p.id } });
      return tx.table.findMany({ where: { id: { in: [p.id, ...others.map((o) => o.id)] } }, include: tableInclude, orderBy: { number: 'asc' } });
    }, TX_OPTS);

    for (const t of affected) emit('table:updated', toEvent(t));
    res.json(affected.map(toView));
  } catch (err) {
    sendError(res, err, 'mergeTables');
  }
};

// ── POST /api/tables/:id/unmerge (WAITER, CASHIER, ADMIN) ────
// Secundaria: se separa siempre (no tiene orden propia). Principal: separa todo el grupo si no hay orden activa.
export const unmergeTable = async (req: Request, res: Response) => {
  try {
    const id = String(req.params.id);
    const affected = await prisma.$transaction(async (tx) => {
      const cur = await tx.table.findUnique({ where: { id }, include: { mergedTables: { select: { id: true } } } });
      if (!cur) throw new HttpError(404, 'Mesa no encontrada');
      await lockTables(tx, [id, ...(cur.mergedIntoId ? [cur.mergedIntoId] : []), ...cur.mergedTables.map((m) => m.id)]);

      if (cur.mergedIntoId) {
        await tx.table.update({ where: { id }, data: { status: 'AVAILABLE', mergedIntoId: null } });
        return tx.table.findMany({ where: { id: { in: [id, cur.mergedIntoId] } }, include: tableInclude, orderBy: { number: 'asc' } });
      }
      const secondaries = await tx.table.findMany({ where: { mergedIntoId: id }, select: { id: true } });
      if (secondaries.length === 0) throw new HttpError(409, `La mesa ${cur.number} no está unida a otras`);
      if (await activeOrderCount(tx, id) > 0) {
        throw new HttpError(409, `La mesa ${cur.number} tiene una orden activa: separa las mesas secundarias una por una`);
      }
      await tx.table.updateMany({ where: { mergedIntoId: id }, data: { status: 'AVAILABLE', mergedIntoId: null } });
      return tx.table.findMany({ where: { id: { in: [id, ...secondaries.map((s) => s.id)] } }, include: tableInclude, orderBy: { number: 'asc' } });
    }, TX_OPTS);

    for (const t of affected) emit('table:updated', toEvent(t));
    res.json(affected.map(toView));
  } catch (err) {
    sendError(res, err, 'unmergeTable');
  }
};
