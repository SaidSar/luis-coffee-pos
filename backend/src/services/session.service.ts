import { Role } from '@prisma/client';
import { prisma } from '../lib/prisma';

// Estado de sesión por usuario (activo, rol, tokenVersion, cambio obligatorio) en memoria, con TTL corto,
// para no consultar la BD en cada request ni en cada handshake de Socket.io.
// Las acciones del ADMIN (desactivar, cambiar rol, restablecer contraseña) llaman a invalidateSession()
// y el efecto es inmediato. Válido para UNA sola instancia del backend: con varias instancias, la caché
// de las demás tardaría hasta TTL_MS en enterarse (habría que usar Redis o pub/sub).
const TTL_MS = 30_000;

export interface SessionState {
  role:               Role;
  active:             boolean;
  tokenVersion:       number;
  mustChangePassword: boolean;
}

const cache = new Map<string, { state: SessionState | null; expires: number }>();

export const getSession = async (userId: string): Promise<SessionState | null> => {
  const hit = cache.get(userId);
  if (hit && hit.expires > Date.now()) return hit.state;
  const u = await prisma.user.findUnique({
    where:  { id: userId },
    select: { role: true, active: true, tokenVersion: true, mustChangePassword: true },
  });
  cache.set(userId, { state: u, expires: Date.now() + TTL_MS });
  return u;
};

export const invalidateSession = (userId: string) => { cache.delete(userId); };

// Payload del JWT: id, rol y versión del token (tv)
export interface TokenPayload { id: string; role: Role; tv: number }
