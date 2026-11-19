import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { Role } from '@prisma/client';
import { getSession, type TokenPayload } from '../services/session.service';

// Rutas permitidas mientras el usuario tenga una contraseña temporal pendiente de cambiar
const ALLOWED_WHILE_PASSWORD_CHANGE = new Set(['/api/auth/me', '/api/auth/change-password']);

// Verifica el JWT y que la sesión siga vigente: usuario activo y misma tokenVersion
// (desactivar, cambiar el rol o restablecer la contraseña sube la versión e invalida los tokens anteriores).
export const authenticate = async (req: Request, res: Response, next: NextFunction) => {
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith('Bearer ')) {
    return res.status(401).json({ message: 'Token no proporcionado' });
  }

  let payload: TokenPayload;
  try {
    payload = jwt.verify(authHeader.split(' ')[1], process.env.JWT_SECRET!) as TokenPayload;
  } catch {
    return res.status(401).json({ message: 'Token inválido o expirado' });
  }

  const session = await getSession(payload.id);
  if (!session || !session.active || session.tokenVersion !== (payload.tv ?? 0)) {
    return res.status(401).json({ message: 'Tu sesión ya no es válida. Vuelve a iniciar sesión.', code: 'SESSION_INVALID' });
  }
  if (session.mustChangePassword && !ALLOWED_WHILE_PASSWORD_CHANGE.has(req.baseUrl + req.path)) {
    return res.status(403).json({ message: 'Debes cambiar tu contraseña temporal antes de continuar', code: 'PASSWORD_CHANGE_REQUIRED' });
  }

  // El rol sale de la sesión vigente (no del token): un cambio de rol aplica al instante
  req.user = { id: payload.id, role: session.role };
  next();
};

// Verifica que el usuario tenga uno de los roles permitidos
export const authorize = (...roles: Role[]) => {
  return (req: Request, res: Response, next: NextFunction) => {
    if (!req.user || !roles.includes(req.user.role)) {
      return res.status(403).json({ message: 'Sin permisos suficientes' });
    }
    next();
  };
};
