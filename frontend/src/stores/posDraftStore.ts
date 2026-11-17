import { create } from 'zustand';
import type { PosOrderType } from '../types/pos';

// Borrador del ticket antes de enviarlo. Vive solo en memoria (sin persist) y se limpia al enviar.
export interface DraftItem {
  productId: string;
  name:      string;
  unitPrice: number; // solo para mostrar; el precio oficial lo fija el servidor
  quantity:  number;
  notes?:    string;
}

interface PosDraftState {
  tableId:       string | null;
  orderType:     PosOrderType;
  customerName?: string;
  items:         DraftItem[];

  addItem:         (item: Omit<DraftItem, 'quantity' | 'notes'>) => void;
  setQuantity:     (productId: string, quantity: number) => void;
  setNotes:        (productId: string, notes: string) => void;
  setCustomerName: (name: string) => void;
  setTable:        (tableId: string) => void;
  setOrderType:    (type: PosOrderType) => void;
  clear:           () => void;
}

const MAX_QTY = 99; // mismo límite que valida el servidor

export const usePosDraftStore = create<PosDraftState>()((set) => ({
  tableId:      null,
  orderType:    'DINE_IN',
  customerName: undefined,
  items:        [],

  // Si el producto ya está en el borrador, suma 1
  addItem: (item) =>
    set((s) => {
      const existing = s.items.find((i) => i.productId === item.productId);
      if (existing) {
        return {
          items: s.items.map((i) =>
            i.productId === item.productId ? { ...i, quantity: Math.min(i.quantity + 1, MAX_QTY) } : i,
          ),
        };
      }
      return { items: [...s.items, { ...item, quantity: 1 }] };
    }),

  // Cantidad 0 (o menor) elimina la línea
  setQuantity: (productId, quantity) =>
    set((s) => ({
      items: quantity <= 0
        ? s.items.filter((i) => i.productId !== productId)
        : s.items.map((i) => (i.productId === productId ? { ...i, quantity: Math.min(quantity, MAX_QTY) } : i)),
    })),

  setNotes: (productId, notes) =>
    set((s) => ({ items: s.items.map((i) => (i.productId === productId ? { ...i, notes } : i)) })),

  setCustomerName: (name) => set({ customerName: name }),

  // Cambiar de mesa empieza un borrador nuevo
  setTable: (tableId) => set({ tableId, orderType: 'DINE_IN', customerName: undefined, items: [] }),

  setOrderType: (type) =>
    set(type === 'TAKEOUT'
      ? { orderType: 'TAKEOUT', tableId: null, customerName: undefined, items: [] }
      : { orderType: 'DINE_IN' }),

  clear: () => set({ items: [] }),
}));

// Total del borrador, solo para mostrar (el total oficial lo calcula el servidor)
export const selectDraftTotal = (s: PosDraftState) =>
  s.items.reduce((sum, i) => sum + i.unitPrice * i.quantity, 0);

export const selectDraftCount = (s: PosDraftState) =>
  s.items.reduce((sum, i) => sum + i.quantity, 0);
