import { useState } from 'react';
import { presetRange, type DateRange, type PresetId } from '../lib/mazatlanDates';

// Estado de periodo compartido por Reportes y Gastos: atajo seleccionado y rango (hora de Mazatlán).
export function usePeriod(initial: PresetId = 'thisMonth') {
  const [preset, setPreset] = useState<PresetId | 'custom'>(initial);
  const [range,  setRange]  = useState<DateRange>(() => presetRange(initial));

  return {
    preset,
    range,
    selectPreset: (id: PresetId) => { setPreset(id); setRange(presetRange(id)); },
    selectCustom: (r: DateRange) => { setPreset('custom'); setRange(r); },
  };
}
