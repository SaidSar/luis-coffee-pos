import { useEffect, useRef, useState } from 'react';
import { Plus, Link2, Unlink, Power, RotateCcw, Loader2 } from 'lucide-react';
import { useAuthStore } from '../../stores/authStore';
import { useAllTables, useCreateTable, useSetTableActive, useUnmergeTable } from '../../hooks/usePos';
import { useDialog } from '../../hooks/useDialog';
import { isAxiosError } from 'axios';
import { describeApiError } from '../../lib/apiError';
import type { Table } from '../../types/pos';
import { btnSecondary, btnPrimary, btnDanger, btnOutlineDanger, tableStatusMeta, tableLabel } from './posUi';
import MergeTablesDialog from './MergeTablesDialog';

interface Props {
  tables:   Table[];             // activas (las que ve el POS)
  announce: (msg: string) => void;
}

// Confirmación para desactivar (alertdialog)
function ConfirmDeactivate({ table, pending, error, onConfirm, onClose }: {
  table: Table; pending: boolean; error: unknown; onConfirm: () => void; onClose: () => void;
}) {
  const ref = useDialog<HTMLDivElement>(() => { if (!pending) onClose(); });
  return (
    <div className="fixed inset-0 bg-espresso/50 z-50 flex items-center justify-center p-4">
      <div ref={ref} role="alertdialog" aria-modal="true" aria-labelledby="deact-title" aria-describedby="deact-desc" tabIndex={-1}
        className="bg-white rounded-2xl w-full max-w-sm p-6 flex flex-col gap-4 focus:outline-none">
        <h2 id="deact-title" className="text-lg font-bold text-espresso">¿Desactivar la mesa {table.number}?</h2>
        <p id="deact-desc" className="text-sm text-espresso/70">Dejará de aparecer en el punto de venta. Puedes restaurarla después desde "Ver inactivas".</p>
        {!!error && <p role="alert" className="text-sm text-red-700 bg-red-50 rounded-lg px-3 py-2">{describeApiError(error, 'tables').message}</p>}
        <div className="flex flex-col-reverse sm:flex-row gap-2 sm:justify-end">
          <button type="button" onClick={onClose} disabled={pending} className={btnSecondary}>Volver</button>
          <button type="button" onClick={onConfirm} disabled={pending} className={btnDanger}>
            {pending && <Loader2 size={16} className="animate-spin" aria-hidden="true" />}
            {pending ? 'Desactivando...' : 'Sí, desactivar'}
          </button>
        </div>
      </div>
    </div>
  );
}

// "Y" para listas cortas: "3 y 4", "3, 4 y 5"
const joinNumbers = (n: number[]) => (n.length <= 1 ? String(n[0] ?? '') : `${n.slice(0, -1).join(', ')} y ${n[n.length - 1]}`);

export default function TableAdminPanel({ tables, announce }: Props) {
  const role    = useAuthStore((s) => s.user?.role);
  const isAdmin = role === 'ADMIN';

  const [showInactive, setShowInactive] = useState(false);
  const [merging, setMerging]           = useState(false);
  const [deactivating, setDeactivating] = useState<Table | null>(null);
  const [rowError, setRowError]         = useState<{ id: string; message: string } | null>(null);

  const all        = useAllTables(isAdmin && showInactive);
  const create     = useCreateTable();
  const setActive  = useSetTableActive();
  const unmerge    = useUnmergeTable();
  const busy       = create.isPending || setActive.isPending || unmerge.isPending;
  const busyRef    = useRef(false); // contra doble clic (isPending cambia en el siguiente render)

  // Tras quitar el botón de origen (desactivar, restaurar, separar) el foco va al encabezado de la lista
  const refocus = useRef(false);
  useEffect(() => {
    if (refocus.current && !deactivating && !merging) {
      refocus.current = false;
      document.getElementById('tables-admin-list-title')?.focus();
    }
  });

  const run = <T,>(fn: (opts: { onSuccess: (r: T) => void; onSettled: () => void; onError: (e: unknown) => void }) => void,
    id: string, onOk: (r: T) => void, on409?: string) => {
    if (busyRef.current) return;
    busyRef.current = true;
    setRowError(null);
    fn({
      onSuccess: onOk,
      onError:   (e) => setRowError({
        id,
        message: on409 && isAxiosError(e) && e.response?.status === 409 ? on409 : describeApiError(e, 'tables').message,
      }),
      onSettled: () => { busyRef.current = false; },
    });
  };

  const addTable = () => run<Table>((o) => create.mutate(4, o), 'new', (t) => announce(`Mesa ${t.number} agregada`));

  const doUnmerge = (t: Table) => run<Table[]>((o) => unmerge.mutate(t.id, o), t.id, () => {
    refocus.current = true;
    announce(t.mergedIntoId ? `Mesa ${t.number} separada` : `Grupo de la mesa ${t.number} separado`);
  }, t.mergedIntoId ? undefined : `La mesa ${t.number} tiene una orden activa: separa sus mesas unidas una por una.`);

  const restore = (t: Table) => run<Table>((o) => setActive.mutate({ id: t.id, active: true }, o), t.id, () => {
    refocus.current = true;
    announce(`Mesa ${t.number} restaurada`);
  });

  const confirmDeactivate = () => {
    if (!deactivating || busyRef.current) return;
    const t = deactivating;
    busyRef.current = true;
    setActive.mutate({ id: t.id, active: false }, {
      onSuccess: () => { refocus.current = true; setDeactivating(null); announce(`Mesa ${t.number} desactivada`); },
      onSettled: () => { busyRef.current = false; },
    });
  };

  const closeMerge = (merged: Table[] | null) => {
    setMerging(false);
    if (merged?.length) {
      const principal = merged.find((t) => !t.mergedIntoId);
      const others = merged.filter((t) => t.mergedIntoId).map((t) => t.number);
      announce(`Mesas ${joinNumbers([principal?.number ?? 0, ...others])} unidas`);
    }
  };

  const inactive = (all.data ?? []).filter((t) => !t.active);
  const canDeactivate = (t: Table) => t.status === 'AVAILABLE' && !t.mergedIntoId && t.mergedNumbers.length === 0 && !t.activeOrder;

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap gap-2">
        {isAdmin && (
          <button type="button" onClick={addTable} disabled={busy} className={btnPrimary}>
            {create.isPending ? <Loader2 size={16} className="animate-spin" aria-hidden="true" /> : <Plus size={16} aria-hidden="true" />}
            Agregar mesa
          </button>
        )}
        <button type="button" onClick={() => setMerging(true)} disabled={busy} className={btnSecondary}>
          <Link2 size={16} aria-hidden="true" /> Juntar mesas
        </button>
        {isAdmin && (
          <button type="button" onClick={() => setShowInactive((v) => !v)} aria-pressed={showInactive} className={btnSecondary}>
            <RotateCcw size={16} aria-hidden="true" /> Ver inactivas
          </button>
        )}
      </div>
      {rowError?.id === 'new' && <p role="alert" className="text-sm text-red-700 bg-red-50 rounded-lg px-3 py-2">{rowError.message}</p>}

      <h3 id="tables-admin-list-title" tabIndex={-1} className="text-xs font-semibold text-espresso/70 uppercase tracking-wide focus:outline-none focus-visible:ring-2 focus-visible:ring-caramel-dark rounded">
        Mesas activas
      </h3>
      <ul className="flex flex-col divide-y divide-espresso/10">
        {tables.map((t) => {
          const meta = tableStatusMeta[t.status];
          const Icon = meta.icon;
          return (
            <li key={t.id} className="py-2 flex flex-wrap items-center justify-between gap-2">
              <span className="text-sm text-espresso">
                <span className="font-semibold">{t.mergedNumbers.length ? tableLabel(t) : `Mesa ${t.number}`}</span>
                <span className="inline-flex items-center gap-1 ml-2 text-xs">
                  <Icon size={12} aria-hidden="true" />
                  {t.mergedIntoId ? `Unida a mesa ${t.mergedIntoNumber}` : meta.label}
                </span>
              </span>
              <span className="flex flex-wrap gap-2">
                {(t.mergedIntoId || t.mergedNumbers.length > 0) && (
                  <button type="button" onClick={() => doUnmerge(t)} disabled={busy} className={btnSecondary}
                    aria-label={t.mergedIntoId ? `Separar mesa ${t.number}` : `Separar el grupo de la mesa ${t.number}`}>
                    <Unlink size={16} aria-hidden="true" /> Separar
                  </button>
                )}
                {isAdmin && canDeactivate(t) && (
                  <button type="button" onClick={() => { setActive.reset(); setDeactivating(t); }} disabled={busy}
                    aria-label={`Desactivar mesa ${t.number}`} className={btnOutlineDanger}>
                    <Power size={16} aria-hidden="true" /> Desactivar
                  </button>
                )}
              </span>
              {rowError?.id === t.id && <p role="alert" className="w-full text-sm text-red-700 bg-red-50 rounded-lg px-3 py-2">{rowError.message}</p>}
            </li>
          );
        })}
      </ul>

      {isAdmin && showInactive && (
        <section aria-labelledby="tables-inactive-title" className="flex flex-col gap-2">
          <h3 id="tables-inactive-title" className="text-xs font-semibold text-espresso/70 uppercase tracking-wide">Mesas inactivas</h3>
          {all.isLoading && <p role="status" className="text-sm text-espresso/70">Cargando...</p>}
          {all.data && inactive.length === 0 && <p className="text-sm text-espresso/70">No hay mesas inactivas.</p>}
          <ul className="flex flex-col divide-y divide-espresso/10">
            {inactive.map((t) => (
              <li key={t.id} className="py-2 flex flex-wrap items-center justify-between gap-2">
                <span className="text-sm text-espresso"><span className="font-semibold">Mesa {t.number}</span> · Desactivada</span>
                <button type="button" onClick={() => restore(t)} disabled={busy} aria-label={`Restaurar mesa ${t.number}`} className={btnSecondary}>
                  <RotateCcw size={16} aria-hidden="true" /> Restaurar
                </button>
                {rowError?.id === t.id && <p role="alert" className="w-full text-sm text-red-700 bg-red-50 rounded-lg px-3 py-2">{rowError.message}</p>}
              </li>
            ))}
          </ul>
        </section>
      )}

      {merging && <MergeTablesDialog tables={tables} onClose={closeMerge} />}
      {deactivating && (
        <ConfirmDeactivate table={deactivating} pending={setActive.isPending} error={setActive.error}
          onConfirm={confirmDeactivate} onClose={() => setDeactivating(null)} />
      )}
    </div>
  );
}
