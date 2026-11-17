import { useState } from 'react';
import { Plus, ScanLine, Tag, Loader2 } from 'lucide-react';
import { useProducts, useCategories, useCreateCategory, useDeleteCategory } from '../hooks/useProducts';
import ProductCard   from '../components/inventory/ProductCard';
import ProductModal  from '../components/inventory/ProductModal';
import ScanMenuModal from '../components/inventory/ScanMenuModal';
import type { Product } from '../types';

export default function Inventory() {
  const { data: products   = [], isLoading: loadingProducts } = useProducts();
  const { data: categories = [] }                             = useCategories();
  const createCategory = useCreateCategory();
  const deleteCategory = useDeleteCategory();

  const [activeCat,   setActiveCat]   = useState<string>('all');
  const [editProduct, setEditProduct] = useState<Product | null | undefined>(undefined);
  const [showScan,    setShowScan]    = useState(false);
  const [newCatName,  setNewCatName]  = useState('');

  // Filtra por categoría activa
  const filtered = activeCat === 'all'
    ? products
    : products.filter(p => p.categoryId === activeCat);

  const handleAddCategory = () => {
    const name = newCatName.trim();
    if (!name) return;
    createCategory.mutate(name, { onSuccess: () => setNewCatName('') });
  };

  return (
    <div className="space-y-5">

      {/* ── Top bar ─────────────────────────────── */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-sm text-espresso/70">
            {products.length} producto{products.length !== 1 ? 's' : ''} registrado{products.length !== 1 ? 's' : ''}
          </p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => setShowScan(true)}
            className="flex items-center gap-2 px-4 py-2 rounded-xl border border-caramel/20 text-espresso text-sm font-medium hover:bg-cream/60 transition-colors"
          >
            <ScanLine size={15} />
            Escanear menú
          </button>
          <button
            onClick={() => setEditProduct(null)}
            className="flex items-center gap-2 px-4 py-2 rounded-xl bg-caramel-dark hover:bg-espresso text-white text-sm font-semibold transition-colors"
          >
            <Plus size={15} />
            Nuevo producto
          </button>
        </div>
      </div>

      {/* ── Categorías ──────────────────────────── */}
      <div className="bg-white rounded-2xl border border-caramel/10 p-4">
        <div className="flex items-center gap-2 mb-3">
          <Tag size={14} className="text-caramel-dark" />
          <span className="text-sm font-semibold text-espresso">Categorías</span>
        </div>

        <div className="flex flex-wrap gap-2 mb-3">
          <button
            onClick={() => setActiveCat('all')}
            className={`px-3 py-1.5 rounded-full text-xs font-medium transition-colors
              ${activeCat === 'all'
                ? 'bg-espresso text-white'
                : 'bg-cream text-espresso hover:bg-caramel/20'
              }`}
          >
            Todos ({products.length})
          </button>
          {categories.map(cat => (
            <div key={cat.id} className="flex items-center gap-1">
              <button
                onClick={() => setActiveCat(cat.id)}
                className={`px-3 py-1.5 rounded-full text-xs font-medium transition-colors
                  ${activeCat === cat.id
                    ? 'bg-caramel-dark text-white'
                    : 'bg-cream text-espresso hover:bg-caramel/20'
                  }`}
              >
                {cat.name} ({cat._count?.products ?? 0})
              </button>
              <button
                onClick={() => deleteCategory.mutate(cat.id)}
                aria-label={`Eliminar categoría ${cat.name}`}
                className="text-espresso/70 hover:text-red-700 text-xs px-1 transition-colors"
                title="Eliminar categoría"
              >
                ×
              </button>
            </div>
          ))}
        </div>

        {/* Nueva categoría */}
        <div className="flex gap-2">
          <input
            value={newCatName}
            onChange={e => setNewCatName(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && handleAddCategory()}
            aria-label="Nombre de la nueva categoría"
            placeholder="Nueva categoría..."
            className="flex-1 px-3 py-1.5 text-xs rounded-lg border border-espresso/50 bg-cream/40 text-espresso placeholder:text-espresso/70 focus:outline-none focus:ring-2 focus:ring-caramel-dark"
          />
          <button
            onClick={handleAddCategory}
            disabled={!newCatName.trim() || createCategory.isPending}
            className="px-3 py-1.5 bg-espresso text-white text-xs rounded-lg hover:bg-caramel-dark transition-colors disabled:opacity-50"
          >
            + Agregar
          </button>
        </div>
      </div>

      {/* ── Grid de productos ───────────────────── */}
      {loadingProducts ? (
        <div className="flex justify-center py-16">
          <Loader2 size={32} className="text-caramel-dark animate-spin" />
        </div>
      ) : filtered.length === 0 ? (
        <div className="bg-white rounded-2xl border border-caramel/10 p-12 text-center">
          <p className="text-2xl mb-2">🍽️</p>
          <p className="font-semibold text-espresso">Sin productos</p>
          <p className="text-sm text-espresso/70 mt-1">
            Crea tu primer producto o escanea el menú con IA
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
          {filtered.map(p => (
            <ProductCard
              key={p.id}
              product={p}
              onEdit={setEditProduct}
            />
          ))}
        </div>
      )}

      {/* ── Modales ─────────────────────────────── */}
      {editProduct !== undefined && (
        <ProductModal
          product={editProduct}
          categories={categories}
          onClose={() => setEditProduct(undefined)}
        />
      )}

      {showScan && (
        <ScanMenuModal onClose={() => setShowScan(false)} />
      )}
    </div>
  );
}