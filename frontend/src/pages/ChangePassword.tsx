import { useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { isAxiosError } from 'axios';
import { KeyRound, Loader2, LogOut } from 'lucide-react';
import api from '../services/api';
import { useAuthStore } from '../stores/authStore';
import { useLogout } from '../hooks/useAuth';
import { fieldErrorsFrom } from '../lib/apiError';
import type { AuthResponse } from '../types';
import { btnPrimary, btnSecondary, inputBase } from '../components/pos/posUi';

const MIN = 10; // mismo mínimo que el servidor
type Field = 'currentPassword' | 'newPassword' | 'confirm';

// Cambio de contraseña. Si es obligatorio (contraseña temporal), se muestra sola, sin menú,
// y la app no deja ir a otra ruta hasta completarlo.
export default function ChangePassword() {
  const user     = useAuthStore((s) => s.user);
  const setAuth  = useAuthStore((s) => s.setAuth);
  const forced   = !!user?.mustChangePassword;
  const navigate = useNavigate();
  const logout   = useLogout();
  const qc       = useQueryClient();

  const [form, setForm]     = useState({ currentPassword: '', newPassword: '', confirm: '' });
  const [errors, setErrors] = useState<Partial<Record<Field, string>>>({});
  const [done, setDone]     = useState(false);
  const submitting = useRef(false);

  const change = useMutation({
    mutationFn: (body: { currentPassword: string; newPassword: string }) =>
      api.post<AuthResponse>('/auth/change-password', body).then((r) => r.data),
  });

  const set = (k: Field) => (e: React.ChangeEvent<HTMLInputElement>) => {
    setForm((f) => ({ ...f, [k]: e.target.value }));
    if (errors[k]) setErrors((x) => ({ ...x, [k]: undefined }));
  };

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (change.isPending || submitting.current) return;
    const found: Partial<Record<Field, string>> = {};
    if (!form.currentPassword) found.currentPassword = forced ? 'Escribe la contraseña temporal que te dieron.' : 'Escribe tu contraseña actual.';
    if (form.newPassword.length < MIN) found.newPassword = `Usa al menos ${MIN} caracteres.`;
    else if (form.newPassword === form.currentPassword) found.newPassword = 'La nueva contraseña debe ser distinta de la actual.';
    if (form.confirm !== form.newPassword) found.confirm = 'La confirmación no coincide.';
    setErrors(found);
    const first = (Object.keys(found) as Field[])[0];
    if (first) { document.getElementById(`cp-${first}`)?.focus(); return; }

    submitting.current = true;
    change.mutate({ currentPassword: form.currentPassword, newPassword: form.newPassword }, {
      onSuccess: ({ user: u, token }) => {
        setAuth({ ...u, mustChangePassword: false }, token); // token nuevo: el socket se reconecta con él
        setForm({ currentPassword: '', newPassword: '', confirm: '' });
        qc.invalidateQueries();
        setDone(true);
        if (forced) navigate('/dashboard', { replace: true });
      },
      onError: (err) => {
        const fe = fieldErrorsFrom(err) as Partial<Record<Field, string>>;
        if (Object.keys(fe).length) {
          setErrors(fe);
          document.getElementById(`cp-${Object.keys(fe)[0]}`)?.focus();
        }
      },
      onSettled: () => { submitting.current = false; },
    });
  };

  const generalError = change.error && !Object.keys(fieldErrorsFrom(change.error)).length
    ? (isAxiosError(change.error) && !change.error.response ? 'Sin conexión con el servidor. Intenta de nuevo.' : 'No se pudo cambiar la contraseña. Intenta de nuevo.')
    : null;
  const describedBy = (k: Field, hint?: string) => [errors[k] ? `cp-${k}-error` : '', hint ?? ''].filter(Boolean).join(' ') || undefined;
  const field = (k: Field, label: string, auto: string, hint?: [string, string]) => (
    <div>
      <label htmlFor={`cp-${k}`} className="block text-sm font-medium text-espresso mb-1">{label}</label>
      <input id={`cp-${k}`} type="password" autoComplete={auto} value={form[k]} onChange={set(k)}
        aria-invalid={!!errors[k]} aria-describedby={describedBy(k, hint?.[0])}
        className={`${inputBase} ${errors[k] ? 'border-red-700' : ''}`} />
      {hint && <p id={hint[0]} className="mt-1 text-xs text-espresso/70">{hint[1]}</p>}
      {errors[k] && <p id={`cp-${k}-error`} className="mt-1 text-sm text-red-700">{errors[k]}</p>}
    </div>
  );

  const card = (
    <section aria-labelledby="cp-title" className="bg-white rounded-2xl border border-caramel/10 p-6 w-full max-w-md flex flex-col gap-4">
      <h1 id="cp-title" className="flex items-center gap-2 text-lg font-bold text-espresso">
        <KeyRound size={20} aria-hidden="true" /> Cambiar contraseña
      </h1>
      {forced && (
        <p className="text-sm text-espresso bg-cream rounded-lg px-3 py-2">
          Estás usando una contraseña temporal. Para continuar, elige una contraseña nueva que solo tú conozcas.
        </p>
      )}
      {done && !forced && <p role="status" className="text-sm text-green-800 bg-green-50 rounded-lg px-3 py-2">Contraseña actualizada. Tus otras sesiones se cerraron.</p>}
      <form onSubmit={submit} noValidate className="flex flex-col gap-4">
        {field('currentPassword', forced ? 'Contraseña temporal' : 'Contraseña actual', 'current-password')}
        {field('newPassword', 'Contraseña nueva', 'new-password', ['cp-new-hint', `Mínimo ${MIN} caracteres.`])}
        {field('confirm', 'Confirma la contraseña nueva', 'new-password')}
        {generalError && <p role="alert" className="text-sm text-red-700 bg-red-50 rounded-lg px-3 py-2">{generalError}</p>}
        <div className="flex flex-col-reverse sm:flex-row gap-2 sm:justify-end">
          {forced && (
            <button type="button" onClick={logout} className={btnSecondary}>
              <LogOut size={16} aria-hidden="true" /> Cerrar sesión
            </button>
          )}
          <button type="submit" disabled={change.isPending} className={btnPrimary}>
            {change.isPending && <Loader2 size={16} className="animate-spin" aria-hidden="true" />}
            {change.isPending ? 'Guardando...' : 'Cambiar contraseña'}
          </button>
        </div>
      </form>
    </section>
  );

  // Obligatorio: pantalla propia, sin menú ni peticiones del resto de la app
  if (forced) {
    return <main className="min-h-dvh bg-cream flex items-center justify-center p-4 font-sans">{card}</main>;
  }
  return <div className="flex justify-center">{card}</div>;
}
