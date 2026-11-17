import { useMemo, useState } from 'react';
import { Search, Loader2, ImageOff } from 'lucide-react';
import { useProducts, useCategories } from '../../hooks/useProducts';
import { describeApiError } from '../../lib/apiError';
import type { Product } from '../../types';
import { formatMXN } from '../../types';
import { focusRing, inputBase, btnSecondary } from './posUi';

interface Props {
  disabled:   boolean; // sin mesa/para llevar seleccionado o sin permiso
  onAdd:      (product: Product) => void;
}

// Solo se bloquea si el producto controla stock y no tiene existencias
const isOutOfStock = (p: Product) => p.trackStock && p.stock <= 0;

export default function ProductPicker({ disabled, onAdd }: Props) {
  const products   = useProducts();
  const categories = useCategories();
  const [category, setCategory] = useState<string>('all');
  const [query,    setQuery]    = useState('');

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    return (products.data ?? [])
      .filter((p) => p.isAvailable)
      .filter((p) => category === 'all' || p.categoryId === category)
      .filter((p) => !q || p.name.toLowerCase().includes(q));
  }, [products.data, category, query]);

  const loading = products.isLoading || categories.isLoading;
  const error   = products.error || categories.error;

  return (
    <section aria-labelledby="pos-catalog-title" className="bg-white rounded-2xl border border-caramel/10 p-4">
      <h2 id="pos-catalog-title" className="text-sm font-semibold text-espresso mb-3">Catálogo</h2>

      <div className="relative mb-3">
        <label htmlFor="pos-search" className="sr-only">Buscar producto</label>
        <Search size={16} aria-hidden="true" className="absolute left-3 top-1/2 -translate-y-1/2 text-espresso/70" />
        <input
          id="pos-search"
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Buscar producto..."
          className={`${inputBase} pl-9`}
        />
      </div>

      {!!categories.data?.length && (
        <div role="group" aria-label="Filtrar por categoría" className="flex gap-2 overflow-x-auto pb-2 mb-2">
          {[{ id: 'all', name: 'Todos' }, ...categories.data].map((c) => (
            <button
              key={c.id}
              type="button"
              onClick={() => setCategory(c.id)}
              aria-pressed={category === c.id}
              className={`
                shrink-0 min-h-11 px-4 rounded-full text-sm font-medium transition-colors ${focusRing}
                ${category === c.id ? 'bg-caramel-dark text-white' : 'bg-cream text-espresso hover:bg-caramel/20'}
              `}
            >
              {c.name}
            </button>
          ))}
        </div>
      )}

      {loading && (
        <p role="status" className="flex items-center gap-2 text-sm text-espresso/70 py-6">
          <Loader2 size={16} className="animate-spin" aria-hidden="true" /> Cargando productos...
        </p>
      )}

      {!!error && !loading && (
        <div role="alert" className="flex flex-wrap items-center gap-3 text-sm text-red-700 bg-red-50 rounded-lg px-3 py-2">
          {describeApiError(error, 'load').message}
          <button type="button" onClick={() => { products.refetch(); categories.refetch(); }} className={btnSecondary}>
            Reintentar
          </button>
        </div>
      )}

      {!loading && !error && visible.length === 0 && (
        <p className="text-sm text-espresso/70 py-6 text-center">
          {query || category !== 'all' ? 'Ningún producto coincide con el filtro.' : 'No hay productos disponibles.'}
        </p>
      )}

      {visible.length > 0 && (
        <ul className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-4 gap-2">
          {visible.map((p) => {
            const out = isOutOfStock(p);
            return (
              <li key={p.id}>
                <button
                  type="button"
                  onClick={() => onAdd(p)}
                  disabled={disabled || out}
                  aria-label={`Agregar ${p.name}, ${formatMXN(p.price)}${out ? ', sin stock' : ''}`}
                  className={`
                    w-full min-h-24 h-full rounded-xl border border-espresso/20 bg-cream/40 p-2 text-left
                    flex flex-col gap-1 transition-colors hover:bg-caramel/20 ${focusRing}
                    disabled:opacity-60 disabled:cursor-not-allowed disabled:hover:bg-cream/40
                  `}
                >
                  {p.imageUrl ? (
                    <img src={p.imageUrl} alt="" className="w-full h-16 object-cover rounded-lg" />
                  ) : (
                    <span className="w-full h-16 rounded-lg bg-white flex items-center justify-center text-espresso/70">
                      <ImageOff size={20} aria-hidden="true" />
                    </span>
                  )}
                  <span className="text-sm font-semibold text-espresso leading-tight">{p.name}</span>
                  <span className="text-sm text-espresso">{formatMXN(p.price)}</span>
                  {out && <span className="text-xs font-semibold text-red-700">Sin stock</span>}
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
