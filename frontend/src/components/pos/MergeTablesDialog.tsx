import { useRef, useState } from 'react';
import { Loader2, Link2 } from 'lucide-react';
import { isAxiosError } from 'axios';
import { useDialog } from '../../hooks/useDialog';
import { useMergeTables } from '../../hooks/usePos';
import { describeApiError } from '../../lib/apiError';
import type { Table } from '../../types/pos';
import { btnPrimary, btnSecondary, inputBase, tableLabel } from './posUi';

interface Props {
  tables:  Table[];                       // mesas activas
  onClose: (merged: Table[] | null) => void;
}

// Detalle de 409 al unir: el servidor lista qué mesa falló y por qué (texto propio del backend)
const mergeProblems = (err: unknown): string[] => {
  if (!isAxiosError(err) || err.response?.status !== 409) return [];
  const t = (err.response.data as { details?: { tables?: unknown } })?.details?.tables;
  return Array.isArray(t) ? t.filter((x): x is string => typeof x === 'string') : [];
};

// Principal: libre u ocupada y que no sea secundaria. Unibles: libres y fuera de cualquier grupo.
export default function MergeTablesDialog({ tables, onClose }: Props) {
  const merge = useMergeTables();
  const principals = tables.filter((t) => !t.mergedIntoId && (t.status === 'AVAILABLE' || t.status === 'OCCUPIED'));
  const [principalId, setPrincipalId] = useState(principals[0]?.id ?? '');
  const [selected, setSelected] = useState<number[]>([]);
  const [error, setError] = useState<string | null>(null);
  const submitting = useRef(false);

  const dialogRef = useDialog<HTMLDivElement>(() => { if (!merge.isPending) onClose(null); });

  const candidates = tables.filter((t) =>
    t.id !== principalId && t.status === 'AVAILABLE' && !t.mergedIntoId && t.mergedNumbers.length === 0 && !t.activeOrder);

  const toggle = (n: number) => { setSelected((s) => (s.includes(n) ? s.filter((x) => x !== n) : [...s, n])); setError(null); };

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (merge.isPending || submitting.current) return;
    if (!principalId) { setError('Elige la mesa principal.'); return; }
    if (selected.length === 0) { setError('Marca al menos una mesa para unir.'); document.getElementById('merge-candidates')?.querySelector('input')?.focus(); return; }
    submitting.current = true;
    merge.mutate({ id: principalId, tableIds: [...selected].sort((a, b) => a - b) }, {
      onSuccess: (r) => onClose(r),
      onSettled: () => { submitting.current = false; },
    });
  };

  const problems = merge.error ? mergeProblems(merge.error) : [];

  return (
    <div className="fixed inset-0 bg-espresso/50 z-50 flex items-center justify-center p-4">
      <div ref={dialogRef} role="dialog" aria-modal="true" aria-labelledby="merge-title" tabIndex={-1}
        className="bg-white rounded-2xl w-full max-w-md max-h-[90dvh] flex flex-col focus:outline-none">
        <h2 id="merge-title" className="text-lg font-bold text-espresso px-6 pt-6 pb-3">Juntar mesas</h2>
        <form onSubmit={submit} noValidate className="flex flex-col min-h-0">
          <div className="flex flex-col gap-4 px-6 overflow-y-auto">
            <div>
              <label htmlFor="merge-principal" className="block text-sm font-medium text-espresso mb-1">Mesa principal (ahí vive la orden)</label>
              <select id="merge-principal" value={principalId} className={inputBase}
                onChange={(e) => { setPrincipalId(e.target.value); setSelected([]); setError(null); }}>
                {principals.map((t) => (
                  <option key={t.id} value={t.id}>
                    {tableLabel(t)} · {t.status === 'OCCUPIED' ? 'Ocupada' : 'Libre'}
                  </option>
                ))}
              </select>
            </div>
            <fieldset id="merge-candidates" aria-describedby={error ? 'merge-error' : undefined}>
              <legend className="text-sm font-medium text-espresso mb-2">Mesas libres a unir</legend>
              {candidates.length === 0 ? (
                <p className="text-sm text-espresso/70">No hay mesas libres disponibles para unir.</p>
              ) : (
                <ul className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                  {candidates.map((t) => (
                    <li key={t.id}>
                      <label className="flex items-center gap-2 min-h-11 px-3 rounded-xl border border-espresso/30 text-sm text-espresso cursor-pointer has-[:checked]:border-caramel-dark has-[:checked]:bg-cream has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-caramel-dark">
                        <input type="checkbox" checked={selected.includes(t.number)} onChange={() => toggle(t.number)}
                          className="h-5 w-5 accent-caramel-dark focus:outline-none" />
                        Mesa {t.number}
                      </label>
                    </li>
                  ))}
                </ul>
              )}
            </fieldset>
            {error && <p id="merge-error" role="alert" className="text-sm text-red-700">{error}</p>}
            {merge.error && (
              <div role="alert" className="text-sm text-red-700 bg-red-50 rounded-lg px-3 py-2">
                <p>{describeApiError(merge.error, 'tables').message}</p>
                {problems.length > 0 && <ul className="list-disc pl-5 mt-1">{problems.map((p) => <li key={p}>{p}</li>)}</ul>}
              </div>
            )}
          </div>
          <div className="flex flex-col-reverse sm:flex-row gap-2 sm:justify-end px-6 py-4 border-t border-espresso/10 mt-4">
            <button type="button" onClick={() => onClose(null)} disabled={merge.isPending} className={btnSecondary}>Cancelar</button>
            <button type="submit" disabled={merge.isPending || candidates.length === 0} className={btnPrimary}>
              {merge.isPending ? <Loader2 size={16} className="animate-spin" aria-hidden="true" /> : <Link2 size={16} aria-hidden="true" />}
              {merge.isPending ? 'Uniendo...' : 'Juntar mesas'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
