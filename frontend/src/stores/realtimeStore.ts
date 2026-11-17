import { create } from 'zustand';

// Estado de la conexión en tiempo real (lo actualiza services/socket.ts)
//  idle         → sin sesión, socket cerrado
//  connecting   → primer intento tras iniciar sesión
//  connected    → "En línea"
//  reconnecting → se perdió la conexión y se está reintentando
//  offline      → no hay conexión (servidor caído o token rechazado); sigue reintentando si aplica
export type ConnectionStatus = 'idle' | 'connecting' | 'connected' | 'reconnecting' | 'offline';

interface RealtimeState {
  status:    ConnectionStatus;
  setStatus: (status: ConnectionStatus) => void;
}

export const useRealtimeStore = create<RealtimeState>()((set) => ({
  status:    'idle',
  setStatus: (status) => set({ status }),
}));
