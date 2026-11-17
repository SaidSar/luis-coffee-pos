import { useEffect, useState } from 'react';
import { Wifi, WifiOff, RefreshCw, type LucideIcon } from 'lucide-react';
import { useRealtimeStore, type ConnectionStatus } from '../../stores/realtimeStore';

interface Meta { label: string; icon: LucideIcon; className: string }

// Texto + icono, nunca solo color. Contraste AA: green-800/green-100, espresso/amber-20, red-700/red-50
const META: Record<Exclude<ConnectionStatus, 'idle'>, Meta> = {
  connecting:   { label: 'Conectando…',   icon: RefreshCw, className: 'bg-amber/20 text-espresso' },
  connected:    { label: 'En línea',      icon: Wifi,      className: 'bg-green-100 text-green-800' },
  reconnecting: { label: 'Reconectando…', icon: RefreshCw, className: 'bg-amber/20 text-espresso' },
  offline:      { label: 'Sin conexión',  icon: WifiOff,   className: 'bg-red-50 text-red-700' },
};

const ANNOUNCE: Partial<Record<ConnectionStatus, string>> = {
  connected:    'Conexión en tiempo real restablecida',
  reconnecting: 'Se perdió la conexión en tiempo real. Reconectando',
  offline:      'Sin conexión en tiempo real. Los datos se actualizarán cada 15 segundos',
};

export default function ConnectionIndicator() {
  const status = useRealtimeStore((s) => s.status);
  const [announcement, setAnnouncement] = useState('');

  // Anuncia solo cambios de estado; no la conexión inicial (connecting → connected) ni el idle
  useEffect(() =>
    useRealtimeStore.subscribe((next, prev) => {
      if (next.status === prev.status) return;
      if (prev.status === 'idle' || next.status === 'idle' || next.status === 'connecting') return;
      if (prev.status === 'connecting' && next.status === 'connected') return;
      const msg = ANNOUNCE[next.status];
      if (msg) setAnnouncement(msg);
    }), []);

  if (status === 'idle') return null;
  const { label, icon: Icon, className } = META[status];
  const spinning = status === 'connecting' || status === 'reconnecting';

  return (
    <>
      <span
        className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold whitespace-nowrap ${className}`}
        title="Estado de la conexión en tiempo real"
      >
        <Icon size={14} aria-hidden="true" className={spinning ? 'motion-safe:animate-spin' : ''} />
        {label}
      </span>
      <span className="sr-only" role="status" aria-live="polite">{announcement}</span>
    </>
  );
}
