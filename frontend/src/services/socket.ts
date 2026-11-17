import { io, type Socket } from 'socket.io-client';
import { useRealtimeStore, type ConnectionStatus } from '../stores/realtimeStore';

// Cliente Socket.io único para toda la app (singleton).
// - autoConnect: false → solo se conecta con sesión iniciada (connectSocket / disconnectSocket).
// - auth como función → se evalúa en cada intento, así cada reconexión usa el token vigente.
// - Reconexión automática, salvo si el servidor rechaza el token (evita un bucle de reintentos).

const SOCKET_URL = import.meta.env.VITE_SOCKET_URL as string;

let socket: Socket | null = null;
let currentToken: string | null = null;

const setStatus = (status: ConnectionStatus) => {
  if (useRealtimeStore.getState().status !== status) useRealtimeStore.getState().setStatus(status);
};

const createSocket = () => {
  const s = io(SOCKET_URL, {
    autoConnect:          false,
    reconnection:         true,
    reconnectionDelay:    1_000,
    reconnectionDelayMax: 10_000,
    transports:           ['websocket', 'polling'],
    auth:                 (cb) => cb({ token: currentToken }),
  });

  s.on('connect', () => setStatus('connected'));

  s.on('disconnect', (reason) => {
    // Desconexión pedida por el cliente (logout) → idle; el resto se reintenta solo
    if (reason === 'io client disconnect') setStatus('idle');
    else setStatus('reconnecting');
  });

  s.on('connect_error', (err) => {
    if (err.message === 'UNAUTHORIZED') {
      // Token inválido o expirado: no insistir. Se reconecta cuando cambie el token.
      s.disconnect();
      setStatus('offline');
      return;
    }
    // Servidor caído o red: queda "Sin conexión" mientras el manager sigue reintentando
    setStatus('offline');
  });

  return s;
};

export const getSocket = (): Socket => {
  socket ??= createSocket();
  return socket;
};

// Idempotente: seguro con el doble montaje de React StrictMode
export const connectSocket = (token: string) => {
  const s = getSocket();
  const tokenChanged = token !== currentToken;
  currentToken = token;

  if (s.connected || s.active) {
    if (!tokenChanged) return;
    // Token nuevo: reabre el handshake con las credenciales nuevas
    s.disconnect();
  }
  setStatus(useRealtimeStore.getState().status === 'idle' ? 'connecting' : 'reconnecting');
  s.connect();
};

export const disconnectSocket = () => {
  currentToken = null;
  if (socket && (socket.connected || socket.active)) socket.disconnect();
  setStatus('idle');
};
