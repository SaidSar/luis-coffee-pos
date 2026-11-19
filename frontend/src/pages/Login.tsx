import { useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { isAxiosError } from 'axios';
import { useLogin } from '../hooks/useAuth';

// Mensaje por status (nunca el texto crudo del error)
const loginError = (err: unknown) => {
  if (!isAxiosError(err) || !err.response) return 'Sin conexión con el servidor. Revisa tu red e intenta de nuevo.';
  if (err.response.status === 403) return 'Tu cuenta está desactivada. Pide a un administrador que la active.';
  if (err.response.status === 401 || err.response.status === 400) return 'Correo o contraseña incorrectos';
  return 'No se pudo iniciar sesión. Intenta de nuevo.';
};

export default function Login() {
  const [email,    setEmail]    = useState('');
  const [password, setPassword] = useState('');
  const login = useLogin();
  const [params] = useSearchParams();
  const sessionEnded = params.get('motivo') === 'sesion';

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    login.mutate({ email, password });
  };

  return (
    <div className="min-h-screen bg-cream flex items-center justify-center font-sans px-4">
      <div className="w-full max-w-sm">

        {/* Branding */}
        <div className="text-center mb-8">
          <div className="w-16 h-16 bg-espresso rounded-2xl flex items-center justify-center mx-auto mb-4 shadow-md">
            <span className="text-3xl" aria-hidden="true">☕</span>
          </div>
          <h1 className="text-2xl font-bold text-espresso">Luis Coffee Break</h1>
          <p className="text-caramel-dark text-sm mt-1">Sistema de Punto de Venta</p>
        </div>

        {/* Card */}
        <div className="bg-white rounded-2xl shadow-sm border border-caramel/10 p-8">
          <h2 className="text-lg font-semibold text-espresso mb-6">Iniciar sesión</h2>
          {sessionEnded && !login.isError && (
            <p role="status" className="text-sm text-espresso bg-cream rounded-lg px-3 py-2 mb-4">
              Tu sesión terminó (expiró o un administrador cambió tu cuenta). Vuelve a iniciar sesión.
            </p>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label htmlFor="login-email" className="block text-sm font-medium text-espresso mb-1.5">
                Correo electrónico
              </label>
              <input
                id="login-email"
                autoComplete="email"
                type="email"
                value={email}
                onChange={e => setEmail(e.target.value)}
                placeholder="admin@luiscoffee.mx"
                required
                className="
                  w-full px-4 py-2.5 rounded-xl
                  border border-espresso/50 bg-cream/40
                  text-espresso placeholder:text-espresso/70
                  focus:outline-none focus:ring-2 focus:ring-caramel-dark focus:border-caramel-dark
                  transition text-sm
                "
              />
            </div>

            <div>
              <label htmlFor="login-password" className="block text-sm font-medium text-espresso mb-1.5">
                Contraseña
              </label>
              <input
                id="login-password"
                autoComplete="current-password"
                type="password"
                value={password}
                onChange={e => setPassword(e.target.value)}
                placeholder="••••••••"
                required
                className="
                  w-full px-4 py-2.5 rounded-xl
                  border border-espresso/50 bg-cream/40
                  text-espresso placeholder:text-espresso/70
                  focus:outline-none focus:ring-2 focus:ring-caramel-dark focus:border-caramel-dark
                  transition text-sm
                "
              />
            </div>

            {/* Error */}
            {login.isError && (
              <p role="alert" className="text-red-700 text-sm text-center bg-red-50 rounded-lg py-2">
                {loginError(login.error)}
              </p>
            )}

            {/* Submit */}
            <button
              type="submit"
              disabled={login.isPending}
              className="
                w-full py-2.5 rounded-xl font-semibold text-sm
                bg-caramel-dark hover:bg-espresso text-white
                transition-colors disabled:opacity-60 disabled:cursor-not-allowed
                mt-2
              "
            >
              {login.isPending ? 'Iniciando sesión...' : 'Entrar al sistema'}
            </button>
          </form>
        </div>

        <p className="text-center text-xs text-espresso/70 mt-6">
          Luis Coffee Break POS · v0.1.0
        </p>
      </div>
    </div>
  );
}