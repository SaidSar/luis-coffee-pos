import crypto from 'crypto';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { Role } from '@prisma/client';

export const MIN_PASSWORD = 10;
export const hashPassword = (plain: string) => bcrypt.hash(plain, 10);

// Contraseña temporal aleatoria (CSPRNG): 14 caracteres de un alfabeto sin ambiguos (0/O, 1/l/I).
// Solo se devuelve una vez en la respuesta; nunca se guarda en claro ni se registra en logs.
const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789';
export const generateTemporaryPassword = (length = 14): string => {
  let out = '';
  for (const b of crypto.randomBytes(length * 2)) {
    if (b < 256 - (256 % ALPHABET.length)) out += ALPHABET[b % ALPHABET.length]; // sin sesgo de módulo
    if (out.length === length) break;
  }
  return out.length === length ? out : generateTemporaryPassword(length);
};

export const signToken = (id: string, role: Role, tokenVersion: number) =>
  jwt.sign({ id, role, tv: tokenVersion }, process.env.JWT_SECRET!, { expiresIn: '7d' });

// Campos públicos del usuario (nunca passwordHash ni tokenVersion)
export const publicUser = {
  id: true, name: true, email: true, role: true, createdAt: true,
  active: true, mustChangePassword: true, lastLoginAt: true,
} as const;
