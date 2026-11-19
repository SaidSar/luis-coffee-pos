import { CircleCheck, CircleSlash } from 'lucide-react';

// Estado con texto + icono (nunca solo color)
export default function StatusBadge({ active }: { active: boolean }) {
  const Icon = active ? CircleCheck : CircleSlash;
  return (
    <span className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-semibold ${active ? 'bg-green-50 text-green-900 border-green-700/40' : 'bg-cream text-espresso border-espresso/40'}`}>
      <Icon size={12} aria-hidden="true" /> {active ? 'Activo' : 'Inactivo'}
    </span>
  );
}
