import { Request, Response } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { prisma } from '../lib/prisma';
import { Role } from '@prisma/client';

const signToken = (id: string, role: Role) =>
  jwt.sign({ id, role }, process.env.JWT_SECRET!, { expiresIn: '7d' });

// ── POST /api/auth/register ──────────────────────────────────
export const register = async (req: Request, res: Response) => {
  try {
    const { name, email, password, role } = req.body;

    if (!name || !email || !password) {
      return res.status(400).json({ message: 'Nombre, email y contraseña son requeridos' });
    }

    const existing = await prisma.user.findUnique({ where: { email } });
    if (existing) {
      return res.status(400).json({ message: 'El email ya está registrado' });
    }

    const passwordHash = await bcrypt.hash(password, 10);

    const user = await prisma.user.create({
      data: { name, email, passwordHash, role: role ?? 'CASHIER' },
      select: { id: true, name: true, email: true, role: true, createdAt: true },
    });

    const token = signToken(user.id, user.role);
    res.status(201).json({ user, token });

  } catch (err) {
    console.error('[register]', err);
    res.status(500).json({ message: 'Error interno al registrar usuario' });
  }
};

// ── POST /api/auth/login ─────────────────────────────────────
export const login = async (req: Request, res: Response) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ message: 'Email y contraseña son requeridos' });
    }

    const user = await prisma.user.findUnique({ where: { email } });
    if (!user) {
      return res.status(401).json({ message: 'Credenciales inválidas' });
    }

    const valid = await bcrypt.compare(password, user.passwordHash);
    if (!valid) {
      return res.status(401).json({ message: 'Credenciales inválidas' });
    }

    const token = signToken(user.id, user.role);
    const { passwordHash, ...userData } = user;

    res.json({ user: userData, token });

  } catch (err) {
    console.error('[login]', err);
    res.status(500).json({ message: 'Error interno al iniciar sesión' });
  }
};

// ── GET /api/auth/me  (requiere authenticate) ────────────────
export const getMe = async (req: Request, res: Response) => {
  try {
    const user = await prisma.user.findUnique({
      where: { id: req.user!.id },
      select: { id: true, name: true, email: true, role: true, createdAt: true },
    });

    if (!user) return res.status(404).json({ message: 'Usuario no encontrado' });

    res.json(user);

  } catch (err) {
    console.error('[getMe]', err);
    res.status(500).json({ message: 'Error al obtener usuario' });
  }
};