import { useState, useRef } from 'react';
import { useDialog } from '../../hooks/useDialog';
import { X, ScanLine, Upload, Check, Loader2 } from 'lucide-react';
import type { ScannedProduct } from '../../types';
import { productService } from '../../services/productService';
import { useCreateProduct, useCategories } from '../../hooks/useProducts';

interface ScanItem extends ScannedProduct {
  selected:           boolean;
  resolvedCategoryId: string;
  description?:       string;
}

interface Props {
  onClose: () => void;
}

export default function ScanMenuModal({ onClose }: Props) {
  const fileRef           = useRef<HTMLInputElement>(null);
  const dialogRef = useDialog<HTMLDivElement>(onClose);
  const [step, setStep]   = useState<'upload' | 'scanning' | 'review'>('upload');
  const [image,   setImage]   = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [results, setResults] = useState<ScanItem[]>([]);
  const [importing, setImporting] = useState(false);

  const { data: categories = [] } = useCategories();
  const createProduct = useCreateProduct();

  // Encuentra la categoría por nombre (lo que devuelve la IA)
  const matchCategory = (aiName: string): string => {
    const found = categories.find(
      c => c.name.toLowerCase() === aiName.toLowerCase()
    );
    return found?.id ?? categories[0]?.id ?? '';
  };

  const handleFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setImage(file);
    setPreview(URL.createObjectURL(file));
  };

  const handleScan = async () => {
    if (!image) return;
    setStep('scanning');
    try {
      const scanned = await productService.scanMenu(image);
      setResults(
        scanned.map(item => {
          const rawItem = item as unknown as Record<string, unknown>;
          return {
            ...item,
            selected: true,
            resolvedCategoryId: matchCategory(item.category),
            description: typeof rawItem.description === 'string' ? rawItem.description : '',
          };
        })
      );
      setStep('review');
    } catch (error: unknown) {
      const status = (error as { response?: { status?: number } })?.response?.status;

      if (status === 503) {
        alert('Función de escaneo por IA no disponible temporalmente. Inténtalo más tarde.');
      } else if (status === 502) {
        alert('La IA no pudo leer el menú. Intenta con una foto más clara.');
      } else {
        alert('Error al analizar la imagen. Intenta de nuevo.');
      }
      setStep('upload');
    }
  };

  const toggleItem  = (i: number) =>
    setResults(prev => prev.map((r, idx) =>
      idx === i ? { ...r, selected: !r.selected } : r
    ));

  const setCategoryForItem = (i: number, categoryId: string) =>
    setResults(prev => prev.map((r, idx) =>
      idx === i ? { ...r, resolvedCategoryId: categoryId } : r
    ));

  const handleImport = async () => {
    const toImport = results.filter(r => r.selected && r.resolvedCategoryId);
    if (!toImport.length) return;

    setImporting(true);
    for (const item of toImport) {
      const data = new FormData();
      data.append('name',         item.name);
      data.append('price',        String(item.price));
      data.append('cost',         '0');
      data.append('stock',        '0');
      data.append('categoryId',   item.resolvedCategoryId);
      data.append('isAvailable', 'true');
      if (item.description) {
        data.append('description', item.description);
      }
      await createProduct.mutateAsync(data).catch(() => {});
    }
    setImporting(false);
    onClose();
  };

  const selectedCount = results.filter(r => r.selected).length;

  return (
    <div className="fixed inset-0 bg-espresso/50 z-50 flex items-center justify-center p-4">
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="scan-modal-title"
        tabIndex={-1}
        className="bg-white rounded-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto focus:outline-none"
      >

        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-caramel/10 sticky top-0 bg-white rounded-t-2xl">
          <div className="flex items-center gap-2">
            <ScanLine size={20} className="text-caramel-dark" />
            <h2 id="scan-modal-title" className="font-bold text-espresso text-lg">Escanear menú con IA</h2>
          </div>
          <button
            onClick={onClose}
            aria-label="Cerrar"
            className="text-espresso/70 hover:text-espresso transition-colors p-1"
          >
            <X size={20} />
          </button>
        </div>

        <div className="p-6">

          {/* PASO 1: Upload */}
          {step === 'upload' && (
            <div className="space-y-4">
              <p className="text-sm text-espresso/60">
                Toma una foto del menú o lista de platillos. La IA extraerá nombre, precio y categoría automáticamente.
              </p>

              <button
                type="button"
                aria-label={preview ? 'Cambiar foto del menú' : 'Subir foto del menú'}
                onClick={() => fileRef.current?.click()}
                className="
                  w-full h-44 rounded-xl border-2 border-dashed border-espresso/50
                  flex items-center justify-center cursor-pointer
                  hover:border-caramel hover:bg-cream/40 transition-colors overflow-hidden
                "
              >
                {preview ? (
                  <img src={preview} alt="Vista previa del menú" className="w-full h-full object-contain" />
                ) : (
                  <span className="flex flex-col items-center gap-2 text-espresso/70">
                    <Upload size={32} />
                    <span className="text-sm">Subir foto del menú</span>
                  </span>
                )}
              </button>
              <input
                ref={fileRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={handleFile}
              />

              <button
                onClick={handleScan}
                disabled={!image}
                className="w-full py-3 bg-caramel-dark hover:bg-espresso text-white rounded-xl font-semibold text-sm transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
              >
                <ScanLine size={16} />
                Analizar con IA
              </button>
            </div>
          )}

          {/* PASO 2: Scanning */}
          {step === 'scanning' && (
            <div className="flex flex-col items-center gap-4 py-10">
              <Loader2 size={40} className="text-caramel-dark animate-spin" />
              <p className="font-semibold text-espresso">Analizando el menú...</p>
              <p className="text-sm text-espresso/70 text-center">
                La IA está extrayendo los platillos de la imagen
              </p>
            </div>
          )}

          {/* PASO 3: Review */}
          {step === 'review' && (
            <div className="space-y-4">
              <p className="text-sm text-espresso/60">
                Se encontraron <strong>{results.length}</strong> platillos.
                Selecciona los que quieras importar y asigna su categoría.
              </p>

              <div className="space-y-2 max-h-72 overflow-y-auto pr-1">
                {results.map((item, i) => (
                  <div
                    key={i}
                    className={`
                      flex items-start gap-3 p-3 rounded-xl border transition-colors
                      ${item.selected
                        ? 'border-caramel/30 bg-cream/30'
                        : 'border-caramel/10 bg-white opacity-50'
                      }
                    `}
                  >
                    {/* Checkbox */}
                    <button
                      onClick={() => toggleItem(i)}
                      type="button"
                      role="checkbox"
                      aria-checked={item.selected}
                      aria-label={`Seleccionar ${item.name}`}
                      className={`
                        w-5 h-5 rounded-full border-2 flex items-center justify-center shrink-0 mt-0.5 transition-colors
                        ${item.selected ? 'bg-caramel-dark border-caramel-dark' : 'border-espresso/50'}
                      `}
                    >
                      {item.selected && <Check size={10} className="text-white" strokeWidth={3} />}
                    </button>

                    {/* Info */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between gap-2">
                        <p className="font-medium text-espresso text-sm truncate">{item.name}</p>
                        <span className="text-sm font-bold text-espresso shrink-0">
                          ${item.price.toFixed(2)}
                        </span>
                      </div>

                      {item.description && (
                        <p className="text-xs text-espresso/70 mt-0.5 truncate">
                          {item.description}
                        </p>
                      )}

                      {/* Categoría */}
                      <select
                        value={item.resolvedCategoryId}
                        onChange={e => setCategoryForItem(i, e.target.value)}
                        disabled={!item.selected}
                        aria-label={`Categoría de ${item.name}`}
                        className="mt-1.5 w-full text-xs px-2 py-1.5 rounded-lg border border-espresso/50 bg-white text-espresso focus:outline-none focus:ring-2 focus:ring-caramel-dark"
                      >
                        <option value="">Sin categoría</option>
                        {categories.map(c => (
                          <option key={c.id} value={c.id}>{c.name}</option>
                        ))}
                      </select>
                    </div>
                  </div>
                ))}
              </div>

              {/* Botones */}
              <div className="flex gap-3 pt-2">
                <button
                  onClick={() => setStep('upload')}
                  className="flex-1 py-2.5 rounded-xl border border-caramel/20 text-espresso text-sm font-medium hover:bg-cream/50 transition-colors"
                >
                  Nueva foto
                </button>
                <button
                  onClick={handleImport}
                  disabled={importing || selectedCount === 0}
                  className="flex-1 py-2.5 rounded-xl bg-caramel-dark hover:bg-espresso text-white text-sm font-semibold transition-colors disabled:opacity-60 flex items-center justify-center gap-2"
                >
                  {importing
                    ? <><Loader2 size={14} className="animate-spin" /> Importando...</>
                    : `Importar ${selectedCount} platillo${selectedCount !== 1 ? 's' : ''}`
                  }
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}