import type { Server as HttpServer } from 'http';
import { Server } from 'socket.io';
import jwt from 'jsonwebtoken';
import { getSession, type TokenPayload } from './session.service';

export type SocketEvent = 'order:created' | 'order:updated' | 'order:paid' | 'table:updated' | 'delivery:updated' | 'cash:updated';

let io: Server | null = null;

// Crea el servidor de Socket.io y exige un JWT válido en handshake.auth.token
export const initSocket = (httpServer: HttpServer) => {
  io = new Server(httpServer, {
    cors: { origin: process.env.FRONTEND_URL || 'http://localhost:5173' },
  });

  // Mismas reglas que el middleware HTTP: JWT válido, usuario activo, misma tokenVersion y sin
  // contraseña temporal pendiente (la pantalla de cambio de contraseña no necesita tiempo real)
  io.use(async (socket, next) => {
    const token = socket.handshake.auth?.token;
    if (typeof token !== 'string' || !token) return next(new Error('UNAUTHORIZED'));
    let payload: TokenPayload;
    try {
      payload = jwt.verify(token, process.env.JWT_SECRET!) as TokenPayload;
    } catch {
      return next(new Error('UNAUTHORIZED'));
    }
    const session = await getSession(payload.id).catch(() => null);
    if (!session || !session.active || session.tokenVersion !== (payload.tv ?? 0) || session.mustChangePassword) {
      return next(new Error('UNAUTHORIZED'));
    }
    socket.data.user = { id: payload.id, role: session.role };
    next();
  });

  io.on('connection', (socket) => {
    // Sala por usuario: permite cerrar al instante los sockets de alguien desactivado o con rol nuevo
    socket.join(`user:${socket.data.user.id}`);
    console.log('🔌 Cliente conectado:', socket.id);
    socket.on('disconnect', () => console.log('❌ Desconectado:', socket.id));
  });

  return io;
};

// Cierra todas las conexiones de un usuario (se reconectan solo con un token vigente)
export const disconnectUser = (userId: string) => {
  io?.in(`user:${userId}`).disconnectSockets(true);
};

// Emite a todos los clientes autenticados. Llamar solo después del commit de la transacción.
export const emit = (event: SocketEvent, payload: unknown) => {
  io?.emit(event, payload);
};
