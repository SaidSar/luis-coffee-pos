import { useState, useRef } from 'react';
import { useDialog } from '../../hooks/useDialog';
import { X, ImageOff } from 'lucide-react';
import type { Product, Category } from '../../types';
import { useCreateProduct, useUpdateProduct } from '../../hooks/useProducts';

interface Props {
  product?:   Product | null;
  categories: Category[];
  onClose:    () => void;
}

interface FormState {
  name:        string;
  description: string;
  price:       string;
  cost:        string;
  stock:       string;
  categoryId:  string;
  isAvailable: boolean;
}

export default function ProductModal({ product, categories, onClose }: Props) {
  const isEdit      = !!product;
  const createMut   = useCreateProduct();
  const updateMut   = useUpdateProduct();
  const fileRef     = useRef<HTMLInputElement>(null);
  const dialogRef = useDialog<HTMLDivElement>(onClose);

  const [form, setForm] = useState<FormState>({
    name:        product?.name           ?? '',
    description: product?.description   ?? '',
    price:       product?.price?.toString() ?? '',
    cost:        product?.cost?.toString()  ?? '',
    stock:       product?.stock?.toString() ?? '0',
    categoryId:  product?.categoryId    ?? '',
    isAvailable: product?.isAvailable   ?? true,
  });

  const [imageFile,    setImageFile]    = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(
    product?.imageUrl ?? null
  );

  const set = (k: keyof FormState) =>
    (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) =>
      setForm(prev => ({ ...prev, [k]: e.target.value }));

  const handleImage = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setImageFile(file);
    setImagePreview(URL.createObjectURL(file));
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    const data = new FormData();
    (Object.keys(form) as (keyof FormState)[]).forEach(k =>
      data.append(k, String(form[k]))
    );
    if (imageFile) data.append('image', imageFile);

    if (isEdit) {
      updateMut.mutate({ id: product!.id, data }, { onSuccess: onClose });
    } else {
      createMut.mutate(data, { onSuccess: onClose });
    }
  };

  const isPending = createMut.isPending || updateMut.isPending;
  const error     = createMut.error || updateMut.error;

  return (
    <div className="fixed inset-0 bg-espresso/50 z-50 flex items-center justify-center p-4">
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="product-modal-title"
        tabIndex={-1}
        className="bg-white rounded-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto focus:outline-none"
      >

        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-caramel/10 sticky top-0 bg-white rounded-t-2xl">
          <h2 id="product-modal-title" className="font-bold text-espresso text-lg">
            {isEdit ? 'Editar producto' : 'Nuevo producto'}
          </h2>
          <button
            onClick={onClose}
            aria-label="Cerrar"
            className="text-espresso/70 hover:text-espresso transition-colors p-1"
          >
            <X size={20} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-4">

          {/* Imagen */}
          <div>
            <p className="block text-sm font-medium text-espresso mb-2">
              Foto del platillo
            </p>
            <button
              type="button"
              aria-label={imagePreview ? 'Cambiar foto del platillo' : 'Subir foto del platillo'}
              onClick={() => fileRef.current?.click()}
              className="
                w-full h-36 rounded-xl border-2 border-dashed border-espresso/50
                flex items-center justify-center cursor-pointer
                hover:border-caramel hover:bg-cream/40 transition-colors overflow-hidden
              "
            >
              {imagePreview ? (
                <img src={imagePreview} alt="Vista previa de la foto del platillo" className="w-full h-full object-cover" />
              ) : (
                <span className="flex flex-col items-center gap-2 text-espresso/70">
                  <ImageOff size={28} />
                  <span className="text-xs">Click para subir imagen</span>
                </span>
              )}
            </button>
            <input
              ref={fileRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={handleImage}
            />
          </div>

          {/* Nombre */}
          <div>
            <label htmlFor="product-name" className="block text-sm font-medium text-espresso mb-1">Nombre *</label>
            <input id="product-name"
              value={form.name}
              onChange={set('name')}
              required
              placeholder="Café Latte"
              className="w-full px-4 py-2.5 rounded-xl border border-espresso/50 bg-cream/30 text-espresso text-sm placeholder:text-espresso/70 focus:outline-none focus:ring-2 focus:ring-caramel-dark"
            />
          </div>

          {/* Descripción */}
          <div>
            <label htmlFor="product-description" className="block text-sm font-medium text-espresso mb-1">Descripción</label>
            <textarea id="product-description"
              value={form.description}
              onChange={set('description')}
              rows={2}
              placeholder="Descripción breve del platillo..."
              className="w-full px-4 py-2.5 rounded-xl border border-espresso/50 bg-cream/30 text-espresso text-sm placeholder:text-espresso/70 focus:outline-none focus:ring-2 focus:ring-caramel-dark resize-none"
            />
          </div>

          {/* Precio + Costo */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label htmlFor="product-price" className="block text-sm font-medium text-espresso mb-1">Precio *</label>
              <input id="product-price"
                type="number"
                step="0.01"
                min="0"
                value={form.price}
                onChange={set('price')}
                required
                placeholder="45.00"
                className="w-full px-4 py-2.5 rounded-xl border border-espresso/50 bg-cream/30 text-espresso text-sm placeholder:text-espresso/70 focus:outline-none focus:ring-2 focus:ring-caramel-dark"
              />
            </div>
            <div>
              <label htmlFor="product-cost" className="block text-sm font-medium text-espresso mb-1">Costo</label>
              <input id="product-cost"
                type="number"
                step="0.01"
                min="0"
                value={form.cost}
                onChange={set('cost')}
                placeholder="15.00"
                className="w-full px-4 py-2.5 rounded-xl border border-espresso/50 bg-cream/30 text-espresso text-sm placeholder:text-espresso/70 focus:outline-none focus:ring-2 focus:ring-caramel-dark"
              />
            </div>
          </div>

          {/* Stock + Categoría */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label htmlFor="product-stock" className="block text-sm font-medium text-espresso mb-1">Stock</label>
              <input id="product-stock"
                type="number"
                min="0"
                value={form.stock}
                onChange={set('stock')}
                className="w-full px-4 py-2.5 rounded-xl border border-espresso/50 bg-cream/30 text-espresso text-sm placeholder:text-espresso/70 focus:outline-none focus:ring-2 focus:ring-caramel-dark"
              />
            </div>
            <div>
              <label htmlFor="product-category" className="block text-sm font-medium text-espresso mb-1">Categoría *</label>
              <select id="product-category"
                value={form.categoryId}
                onChange={set('categoryId')}
                required
                className="w-full px-4 py-2.5 rounded-xl border border-espresso/50 bg-cream/30 text-espresso text-sm placeholder:text-espresso/70 focus:outline-none focus:ring-2 focus:ring-caramel-dark"
              >
                <option value="">Seleccionar...</option>
                {categories.map(c => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </select>
            </div>
          </div>

          {/* Disponible */}
          <div className="flex items-center gap-3">
            <input
              id="isAvailable"
              type="checkbox"
              checked={form.isAvailable}
              onChange={e => setForm(p => ({ ...p, isAvailable: e.target.checked }))}
              className="w-4 h-4 accent-caramel-dark"
            />
            <label htmlFor="isAvailable" className="text-sm font-medium text-espresso">
              Disponible en el menú
            </label>
          </div>

          {/* Error */}
          {error && (
            <p role="alert" className="text-red-700 text-sm bg-red-50 rounded-lg px-4 py-2 text-center">
              Error al guardar. Intenta de nuevo.
            </p>
          )}

          {/* Botones */}
          <div className="flex gap-3 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 py-2.5 rounded-xl border border-caramel/20 text-espresso text-sm font-medium hover:bg-cream/50 transition-colors"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={isPending}
              className="flex-1 py-2.5 rounded-xl bg-caramel-dark hover:bg-espresso text-white text-sm font-semibold transition-colors disabled:opacity-60"
            >
              {isPending ? 'Guardando...' : isEdit ? 'Guardar cambios' : 'Crear producto'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}