import { Link } from 'react-router-dom';
import { Lock } from 'lucide-react';
import { useAuthStore } from '../../stores/authStore';
import { useCashStatus } from '../../hooks/useCash';
import { focusRing } from '../pos/posUi';

// Aviso discreto "Caja cerrada". Cajero y administrador ven el enlace para abrirla; el mesero, solo el aviso.
export default function CashClosedNotice({ variant }: { variant: 'pill' | 'banner' }) {
  const role   = useAuthStore((s) => s.user?.role);
  const status = useCashStatus();
  if (!status.data || status.data.open) return null;

  const canOpen = role === 'ADMIN' || role === 'CASHIER';

  if (variant === 'pill') {
    return (
      <p role="status" className="hidden md:inline-flex items-center gap-1.5 rounded-full border border-amber-700/40 bg-amber-50 px-3 py-1 text-xs font-semibold text-amber-900">
        <Lock size={12} aria-hidden="true" />
        {canOpen
          ? <Link to="/cash" className={`underline rounded ${focusRing}`}>Caja cerrada</Link>
          : 'Caja cerrada'}
      </p>
    );
  }
  return (
    <p role="status" className="flex flex-wrap items-center gap-2 text-sm text-amber-900 bg-amber-50 border border-amber-700/30 rounded-xl px-3 py-2">
      <Lock size={16} aria-hidden="true" />
      <span>Caja cerrada.</span>
      {canOpen
        ? <Link to="/cash" className={`inline-flex items-center min-h-11 underline font-semibold rounded ${focusRing}`}>Abrir caja</Link>
        : <span>Avisa a caja para que la abran antes de cobrar.</span>}
    </p>
  );
}
