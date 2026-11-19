import { Request, Response } from 'express';
import bcrypt from 'bcryptjs';
import { z } from 'zod';
import { prisma } from '../lib/prisma';
import { HttpError, parse, sendError } from '../lib/http-error';
import { MIN_PASSWORD, hashPassword, publicUser, signToken } from '../lib/password';
import { invalidateSession } from '../services/session.service';
import { disconnectUser } from '../services/socket.service';

// El alta de usuarios es solo de ADMIN (POST /api/employees); ya no hay registro público.

const loginSchema = z.object({
  email:    z.string().trim().min(1, { message: 'El correo es obligatorio' }).max(200),
  password: z.string().min(1, { message: 'La contraseña es obligatoria' }).max(200),
});

const changePasswordSchema = z.object({
  currentPassword: z.string().min(1, { message: 'Indica tu contraseña actual' }).max(200),
  newPassword:     z.string().min(MIN_PASSWORD, { message: `Mínimo ${MIN_PASSWORD} caracteres` }).max(128, { message: 'Máximo 128 caracteres' }),
}).refine((d) => d.currentPassword !== d.newPassword, { message: 'La nueva contraseña debe ser distinta de la actual', path: ['newPassword'] });

// ── POST /api/auth/login ─────────────────────────────────────
// Credenciales incorrectas: 401 genérico. Contraseña correcta pero cuenta inactiva: 403.
export const login = async (req: Request, res: Response) => {
  try {
    const { email, password } = parse(loginSchema, req.body);
    const user = await prisma.user.findFirst({ where: { email: { equals: email, mode: 'insensitive' } } });
    if (!user || !(await bcrypt.compare(password, user.passwordHash))) {
      throw new HttpError(401, 'Credenciales inválidas');
    }
    if (!user.active) throw new HttpError(403, 'Cuenta desactivada', { code: 'ACCOUNT_DISABLED' });

    const updated = await prisma.user.update({ where: { id: user.id }, data: { lastLoginAt: new Date() }, select: publicUser });
    res.json({ user: updated, token: signToken(user.id, user.role, user.tokenVersion), mustChangePassword: user.mustChangePassword });
  } catch (err) {
    sendError(res, err, 'login');
  }
};

// ── GET /api/auth/me ─────────────────────────────────────────
export const getMe = async (req: Request, res: Response) => {
  try {
    const user = await prisma.user.findUnique({ where: { id: req.user!.id }, select: publicUser });
    if (!user) throw new HttpError(404, 'Usuario no encontrado');
    res.json(user);
  } catch (err) {
    sendError(res, err, 'getMe');
  }
};

// ── POST /api/auth/change-password ───────────────────────────
// Apaga el cambio obligatorio, sube tokenVersion (cierra las demás sesiones) y devuelve un token nuevo.
export const changePassword = async (req: Request, res: Response) => {
  try {
    const body = parse(changePasswordSchema, req.body);
    const user = await prisma.user.findUnique({ where: { id: req.user!.id } });
    if (!user) throw new HttpError(404, 'Usuario no encontrado');
    // 400 (no 401): una contraseña actual equivocada no debe cerrar la sesión en el cliente
    if (!(await bcrypt.compare(body.currentPassword, user.passwordHash))) {
      throw new HttpError(400, 'La contraseña actual no es correcta', [{ path: 'currentPassword', message: 'La contraseña actual no es correcta' }]);
    }
    const updated = await prisma.user.update({
      where: { id: user.id },
      data:  { passwordHash: await hashPassword(body.newPassword), mustChangePassword: false, tokenVersion: { increment: 1 } },
      select: { ...publicUser, tokenVersion: true },
    });
    invalidateSession(user.id);
    disconnectUser(user.id);
    const { tokenVersion, ...view } = updated;
    res.json({ user: view, token: signToken(user.id, updated.role, tokenVersion) });
  } catch (err) {
    sendError(res, err, 'changePassword');
  }
};
