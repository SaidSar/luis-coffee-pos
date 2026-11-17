import { Response } from 'express';
import { Prisma } from '@prisma/client';
import { z, ZodError } from 'zod';

// Error con código HTTP y mensaje seguro para el cliente.
// `details` solo debe contener datos que el cliente puede ver (p. ej. nombres de productos).
export class HttpError extends Error {
  constructor(
    public readonly status: number,
    message: string,
    public readonly details?: unknown,
  ) {
    super(message);
    this.name = 'HttpError';
  }
}

// Valida con zod y lanza 400 con los campos inválidos (mensajes de zod, nunca err.message interno)
export const parse = <T extends z.ZodType>(schema: T, data: unknown): z.infer<T> => {
  const result = schema.safeParse(data);
  if (!result.success) throw toValidationError(result.error);
  return result.data;
};

const toValidationError = (err: ZodError) =>
  new HttpError(
    400,
    'Datos inválidos',
    err.issues.map((i) => ({ path: i.path.join('.'), message: i.message })),
  );

// Traduce cualquier error a una respuesta HTTP sin filtrar detalles internos
export const sendError = (res: Response, err: unknown, tag: string) => {
  if (err instanceof HttpError) {
    return res.status(err.status).json(
      err.details === undefined ? { message: err.message } : { message: err.message, details: err.details },
    );
  }
  if (err instanceof ZodError) {
    const e = toValidationError(err);
    return res.status(e.status).json({ message: e.message, details: e.details });
  }
  if (err instanceof Prisma.PrismaClientKnownRequestError) {
    if (err.code === 'P2025') return res.status(404).json({ message: 'Recurso no encontrado' });
    if (err.code === 'P2002') return res.status(409).json({ message: 'El recurso ya existe' });
    if (err.code === 'P2003') return res.status(409).json({ message: 'Referencia inválida' });
  }
  console.error(`[${tag}]`, err);
  return res.status(500).json({ message: 'Error interno del servidor' });
};
