import { useState } from 'react';
import { PRESETS, daysBetweenInclusive, formatYmd, type DateRange, type PresetId } from '../../lib/mazatlanDates';
import { focusRing } from './reportUi';

interface Props {
  value:    DateRange;
  preset:   PresetId | 'custom';
  onPreset: (id: PresetId) => void;
  onCustom: (range: DateRange) => void;
}

const MAX_DAYS = 366;
const input = `w-full min-h-11 px-3 rounded-xl border border-espresso/50 bg-white text-espresso text-sm focus:outline-none focus:ring-2 focus:ring-caramel-dark`;

export default function PeriodSelector({ value, preset, onPreset, onCustom }: Props) {
  const [from, setFrom] = useState(value.from);
  const [to,   setTo]   = useState(value.to);
  const [error, setError] = useState<string | null>(null);

  const applyCustom = (e: React.FormEvent) => {
    e.preventDefault();
    if (!from || !to) return setError('Indica ambas fechas.');
    if (from > to) return setError('"Desde" no puede ser posterior a "Hasta".');
    if (daysBetweenInclusive(from, to) > MAX_DAYS) return setError(`El periodo máximo es de ${MAX_DAYS} días.`);
    setError(null);
    onCustom({ from, to });
  };

  return (
    <div className="flex flex-col gap-3">
      <div role="group" aria-label="Periodo del reporte" className="flex flex-wrap gap-2">
        {PRESETS.map((p) => (
          <button
            key={p.id}
            type="button"
            aria-pressed={preset === p.id}
            onClick={() => { setError(null); onPreset(p.id); }}
            className={`min-h-11 px-4 rounded-full text-sm font-medium transition-colors ${focusRing}
              ${preset === p.id ? 'bg-caramel-dark text-white' : 'bg-cream text-espresso hover:bg-caramel/20'}`}
          >
            {p.label}
          </button>
        ))}
      </div>

      {/* noValidate: la validación propia muestra el error con role="alert" (min/max solo guían al selector) */}
      <form onSubmit={applyCustom} noValidate className="flex flex-wrap items-end gap-2" aria-label="Rango personalizado">
        <div className="flex-1 min-w-36">
          <label htmlFor="report-from" className="block text-sm font-medium text-espresso mb-1">Desde</label>
          <input id="report-from" type="date" value={from} max={to || undefined}
            onChange={(e) => setFrom(e.target.value)} className={input} />
        </div>
        <div className="flex-1 min-w-36">
          <label htmlFor="report-to" className="block text-sm font-medium text-espresso mb-1">Hasta</label>
          <input id="report-to" type="date" value={to} min={from || undefined}
            onChange={(e) => setTo(e.target.value)} className={input} />
        </div>
        <button
          type="submit"
          aria-pressed={preset === 'custom'}
          className={`min-h-11 px-4 rounded-xl text-sm font-semibold transition-colors ${focusRing}
            ${preset === 'custom' ? 'bg-caramel-dark text-white' : 'border border-espresso/50 bg-white text-espresso hover:bg-cream'}`}
        >
          Aplicar rango
        </button>
      </form>

      {error && <p role="alert" className="text-sm text-red-700 bg-red-50 rounded-lg px-3 py-2">{error}</p>}

      <p className="text-sm text-espresso/70">
        Mostrando del <strong className="text-espresso">{formatYmd(value.from)}</strong> al{' '}
        <strong className="text-espresso">{formatYmd(value.to)}</strong> (hora de Mazatlán).
      </p>
    </div>
  );
}
