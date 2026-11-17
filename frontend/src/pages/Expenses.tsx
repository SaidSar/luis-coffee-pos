import { useEffect, useRef, useState } from 'react';
import { Plus, Pencil, Trash2 } from 'lucide-react';
import { usePeriod } from '../hooks/usePeriod';
import { useExpenses, useDeleteExpense } from '../hooks/useExpenses';
import { formatYmd } from '../lib/mazatlanDates';
import { EXPENSE_CATEGORIES, EXPENSE_CATEGORY_LABEL, type ExpenseCategory } from '../constants/expenseCategories';
import type { Expense } from '../types/expenses';
import PeriodSelector from '../components/reports/PeriodSelector';
import ReportBlock from '../components/reports/ReportBlock';
import DataTable from '../components/reports/DataTable';
import ExpenseFormModal from '../components/expenses/ExpenseFormModal';
import ConfirmDeleteExpense from '../components/expenses/ConfirmDeleteExpense';
import { formatMoney, focusRing, card } from '../components/reports/reportUi';

const iconBtn = `min-h-11 min-w-11 inline-flex items-center justify-center rounded-xl text-espresso hover:bg-cream ${focusRing}`;

export default function Expenses() {
  const { preset, range, selectPreset, selectCustom } = usePeriod('thisMonth');
  const [category, setCategory] = useState<ExpenseCategory | ''>('');
  const [editing,  setEditing]  = useState<Expense | null | undefined>(undefined); // undefined = modal cerrado, null = nuevo
  const [deleting, setDeleting] = useState<Expense | null>(null);
  const [announcement, setAnnouncement] = useState('');

  const list   = useExpenses({ ...range, category: category || undefined });
  const remove = useDeleteExpense();

  const announce = (msg: string) => setAnnouncement((prev) => (prev === msg ? `${msg} ` : msg));

  const closeForm = (saved?: 'created' | 'updated') => {
    setEditing(undefined);
    if (saved === 'created') announce('Gasto registrado');
    if (saved === 'updated') announce('Gasto actualizado');
  };

  // Bandera síncrona contra doble clic en "Sí, eliminar" (remove.isPending cambia en el siguiente render)
  const deletingNow = useRef(false);
  // Tras borrar, el botón que abrió el diálogo desaparece con su fila: el foco pasa a "Nuevo gasto".
  // Se hace en un efecto del padre, que corre después de que el diálogo (ya desmontado) devuelva el foco.
  const newButtonRef = useRef<HTMLButtonElement>(null);
  const refocusAfterDelete = useRef(false);
  useEffect(() => {
    if (!deleting && refocusAfterDelete.current) {
      refocusAfterDelete.current = false;
      newButtonRef.current?.focus();
    }
  }, [deleting]);
  const confirmDelete = () => {
    if (!deleting || deletingNow.current) return;
    deletingNow.current = true;
    remove.mutate(deleting.id, {
      onSuccess: () => {
        refocusAfterDelete.current = true;
        setDeleting(null);
        announce('Gasto eliminado');
      },
      onSettled: () => { deletingNow.current = false; },
    });
  };

  const data = list.data;

  return (
    <div className="flex flex-col gap-4 min-w-0">
      <p className="sr-only" role="status" aria-live="polite">{announcement}</p>

      <section aria-labelledby="expenses-period-title" className={`${card} flex flex-col gap-3`}>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 id="expenses-period-title" className="text-base font-bold text-espresso">Periodo</h2>
          <button
            ref={newButtonRef}
            type="button"
            onClick={() => setEditing(null)}
            className={`inline-flex items-center justify-center gap-2 min-h-11 px-5 rounded-xl text-sm font-semibold bg-caramel-dark hover:bg-espresso text-white transition-colors ${focusRing}`}
          >
            <Plus size={16} aria-hidden="true" />
            Nuevo gasto
          </button>
        </div>
        <PeriodSelector
          key={`${range.from}_${range.to}`}
          value={range}
          preset={preset}
          onPreset={selectPreset}
          onCustom={selectCustom}
          label="Periodo de gastos"
          idPrefix="expenses"
        />
        <div className="max-w-xs">
          <label htmlFor="expenses-category" className="block text-sm font-medium text-espresso mb-1">Categoría</label>
          <select
            id="expenses-category"
            value={category}
            onChange={(e) => setCategory(e.target.value as ExpenseCategory | '')}
            className="w-full min-h-11 px-3 rounded-xl border border-espresso/50 bg-white text-espresso text-sm focus:outline-none focus:ring-2 focus:ring-caramel-dark"
          >
            <option value="">Todas</option>
            {EXPENSE_CATEGORIES.map((c) => <option key={c} value={c}>{EXPENSE_CATEGORY_LABEL[c]}</option>)}
          </select>
        </div>
      </section>

      <ReportBlock
        title="Gastos"
        titleId="expenses-list-title"
        isLoading={list.isLoading}
        error={list.error}
        isEmpty={!data?.items.length}
        emptyText="Sin gastos en este periodo"
        onRetry={() => list.refetch()}
        actions={data && data.count > 0 && (
          <p className="text-sm text-espresso">
            {data.count} {data.count === 1 ? 'gasto' : 'gastos'} · <strong>{formatMoney(data.total)}</strong>
          </p>
        )}
      >
        {data && (
          <>
            {data.count > data.items.length && (
              <p className="text-sm text-espresso/70">
                Se muestran los {data.items.length} más recientes de {data.count}. El total corresponde a todo el periodo.
              </p>
            )}
            <DataTable<Expense>
              caption="Gastos del periodo"
              rows={data.items}
              rowKey={(e) => e.id}
              columns={[
                { header: 'Fecha', cell: (e) => formatYmd(e.date), rowHeader: true },
                { header: 'Descripción', cell: (e) => (
                  <span className="whitespace-normal block max-w-72">
                    {e.description}
                    {e.notes && <span className="block text-xs text-espresso/70">{e.notes}</span>}
                  </span>
                ) },
                { header: 'Categoría',      cell: (e) => EXPENSE_CATEGORY_LABEL[e.category] ?? e.category },
                { header: 'Registrado por', cell: (e) => e.user.name },
                { header: 'Monto',          cell: (e) => formatMoney(e.amount), align: 'right' },
                { header: 'Acciones', cell: (e) => (
                  <span className="flex gap-1">
                    <button type="button" onClick={() => setEditing(e)} aria-label={`Editar gasto ${e.description}`} className={iconBtn}>
                      <Pencil size={16} aria-hidden="true" />
                    </button>
                    <button type="button" onClick={() => { remove.reset(); setDeleting(e); }} aria-label={`Eliminar gasto ${e.description}`} className={`${iconBtn} text-red-700 hover:bg-red-50`}>
                      <Trash2 size={16} aria-hidden="true" />
                    </button>
                  </span>
                ) },
              ]}
              footer={['Total del periodo', '', '', '', formatMoney(data.total), '']}
            />
          </>
        )}
      </ReportBlock>

      {editing !== undefined && <ExpenseFormModal expense={editing} onClose={closeForm} />}
      {deleting && (
        <ConfirmDeleteExpense
          expense={deleting}
          pending={remove.isPending}
          error={remove.error}
          onConfirm={confirmDelete}
          onClose={() => setDeleting(null)}
        />
      )}
    </div>
  );
}
