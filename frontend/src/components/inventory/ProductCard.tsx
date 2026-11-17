import { Pencil, Trash2, ImageOff } from 'lucide-react';
import type { Product } from '../../types';
import { formatMXN } from '../../types';
import { useToggleProduct, useDeleteProduct } from '../../hooks/useProducts';

interface Props {
  product:  Product;
  onEdit:   (p: Product) => void;
}

export default function ProductCard({ product, onEdit }: Props) {
  const toggle = useToggleProduct();
  const remove = useDeleteProduct();

  const handleDelete = () => {
    if (confirm(`¿Eliminar "${product.name}"?`)) {
      remove.mutate(product.id);
    }
  };

  return (
    <div className="bg-white rounded-2xl border border-caramel/10 overflow-hidden flex flex-col">

      {/* Imagen */}
      <div className="h-36 bg-cream flex items-center justify-center overflow-hidden shrink-0">
        {product.imageUrl ? (
          <img
            src={product.imageUrl}
            alt={product.name}
            className="w-full h-full object-cover"
          />
        ) : (
          <div className="flex flex-col items-center gap-1 text-espresso/70">
            <ImageOff size={28} />
            <span className="text-xs">Sin imagen</span>
          </div>
        )}
      </div>

      {/* Info */}
      <div className="p-4 flex flex-col gap-2 flex-1">
        <div>
          <p className="font-semibold text-espresso text-sm leading-tight">{product.name}</p>
          <p className="text-xs text-caramel-dark mt-0.5">{product.category.name}</p>
        </div>

        <div className="flex items-center justify-between">
          <span className="text-base font-bold text-espresso">{formatMXN(product.price)}</span>
          <span className="text-xs text-espresso/70">costo {formatMXN(product.cost)}</span>
        </div>

        {/* Stock badge: solo para productos con control de stock */}
        {product.trackStock && (
          <div className="flex items-center gap-2">
            <span className={`
              text-xs font-medium px-2 py-0.5 rounded-full
              ${product.stock > 5  ? 'bg-green-100 text-green-700'  :
                product.stock > 0  ? 'bg-amber/20 text-espresso'   :
                                     'bg-red-100 text-red-700'      }
            `}>
              Stock: {product.stock}
            </span>
          </div>
        )}

        {/* Footer: toggle + acciones */}
        <div className="flex items-center justify-between mt-auto pt-2 border-t border-caramel/10">
          <button
            onClick={() => toggle.mutate(product.id)}
            disabled={toggle.isPending}
            className={`
              text-xs font-medium px-3 py-1 rounded-full transition-colors
              ${product.isAvailable
                ? 'bg-espresso text-white hover:bg-espresso/80'
                : 'bg-espresso/10 text-espresso/70 hover:bg-espresso/20'
              }
            `}
          >
            {product.isAvailable ? 'Activo' : 'Inactivo'}
          </button>

          <div className="flex gap-1">
            <button
              onClick={() => onEdit(product)}
              aria-label={`Editar ${product.name}`}
              className="p-1.5 rounded-lg text-espresso/70 hover:text-caramel-dark hover:bg-caramel/10 transition-colors"
            >
              <Pencil size={14} />
            </button>
            <button
              onClick={handleDelete}
              disabled={remove.isPending}
              aria-label={`Eliminar ${product.name}`}
              className="p-1.5 rounded-lg text-espresso/70 hover:text-red-700 hover:bg-red-50 transition-colors"
            >
              <Trash2 size={14} />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}