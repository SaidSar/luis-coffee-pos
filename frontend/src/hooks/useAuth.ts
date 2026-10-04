import { useMutation } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import api from '../services/api';
import { useAuthStore } from '../stores/authStore';
import type { AuthResponse } from '../types';

// Hook para login
export function useLogin() {
  const { setAuth } = useAuthStore();
  const navigate    = useNavigate();

  return useMutation({
    mutationFn: (data: { email: string; password: string }) =>
      api.post<AuthResponse>('/auth/login', data).then(r => r.data),

    onSuccess: ({ user, token }) => {
      setAuth(user, token);
      navigate('/dashboard', { replace: true });
    },
  });
}

// Hook para logout
export function useLogout() {
  const { logout } = useAuthStore();
  const navigate   = useNavigate();

  return () => {
    logout();
    navigate('/login', { replace: true });
  };
}