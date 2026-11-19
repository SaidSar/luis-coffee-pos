import axios from 'axios';
import { useAuthStore } from '../stores/authStore';

const api = axios.create({
  baseURL: `${import.meta.env.VITE_API_URL}/api`,
});

// Inyectar token en cada request
api.interceptors.request.use((config) => {
  const token = localStorage.getItem('token');
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

// Rutas donde un 401/400 es parte del formulario (credenciales o contraseña actual incorrectas)
const FORM_AUTH = ['/auth/login', '/auth/change-password'];

// 401: la sesión ya no es válida (expirada, desactivada, rol o contraseña cambiados) → se cierra una sola vez
// y se lleva al login con un aviso; sin recargas en bucle si ya estamos ahí.
// 403 PASSWORD_CHANGE_REQUIRED: contraseña temporal pendiente → solo se permite /change-password.
api.interceptors.response.use(
  (res) => res,
  (err) => {
    const status = err.response?.status;
    const url: string = err.config?.url ?? '';
    const code = err.response?.data?.code;
    if (status === 401 && !FORM_AUTH.some((p) => url.endsWith(p))) {
      useAuthStore.getState().logout();
      if (window.location.pathname !== '/login') window.location.replace('/login?motivo=sesion');
    } else if (status === 403 && code === 'PASSWORD_CHANGE_REQUIRED') {
      useAuthStore.getState().requirePasswordChange();
      if (window.location.pathname !== '/change-password') window.location.replace('/change-password');
    }
    return Promise.reject(err);
  }
);

export default api;
