import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { User } from '../types';

interface AuthState {
  user:            User | null;
  token:           string | null;
  setAuth:         (user: User, token: string) => void;
  requirePasswordChange: () => void;
  logout:          () => void;
  isAuthenticated: () => boolean;
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set, get) => ({
      user:  null,
      token: null,

      setAuth: (user, token) => {
        localStorage.setItem('token', token);
        set({ user, token });
      },

      // El servidor respondió PASSWORD_CHANGE_REQUIRED: la app solo permite /change-password
      requirePasswordChange: () => set((s) => (s.user ? { user: { ...s.user, mustChangePassword: true } } : s)),

      logout: () => {
        localStorage.removeItem('token');
        set({ user: null, token: null });
      },

      isAuthenticated: () => !!get().token,
    }),
    { name: 'lcb-auth' } // clave en localStorage
  )
);