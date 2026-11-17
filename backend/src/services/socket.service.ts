import type { Server as HttpServer } from 'http';
import { Server } from 'socket.io';
import jwt from 'jsonwebtoken';
import type { Role } from '@prisma/client';

export type SocketEvent = 'order:created' | 'order:updated' | 'order:paid' | 'table:updated';

let io: Server | null = null;

// Crea el servidor de Socket.io y exige un JWT válido en handshake.auth.token
export const initSocket = (httpServer: HttpServer) => {
  io = new Server(httpServer, {
    cors: { origin: process.env.FRONTEND_URL || 'http://localhost:5173' },
  });

  io.use((socket, next) => {
    const token = socket.handshake.auth?.token;
    if (typeof token !== 'string' || !token) return next(new Error('UNAUTHORIZED'));
    try {
      const payload = jwt.verify(token, process.env.JWT_SECRET!) as { id: string; role: Role };
      socket.data.user = { id: payload.id, role: payload.role };
      next();
    } catch {
      next(new Error('UNAUTHORIZED'));
    }
  });

  io.on('connection', (socket) => {
    console.log('🔌 Cliente conectado:', socket.id);
    socket.on('disconnect', () => console.log('❌ Desconectado:', socket.id));
  });

  return io;
};

// Emite a todos los clientes autenticados. Llamar solo después del commit de la transacción.
export const emit = (event: SocketEvent, payload: unknown) => {
  io?.emit(event, payload);
};
