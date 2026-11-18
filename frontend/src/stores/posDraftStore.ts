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

// Datos de entrega a domicilio (texto tal cual lo escribe el usuario; el servidor valida y normaliza)
export interface DeliveryDraft {
  phone:       string;
  address:     string;
  reference:   string;
  deliveryFee: string;
}

const EMPTY_DELIVERY: DeliveryDraft = { phone: '', address: '', reference: '', deliveryFee: '0' };

interface PosDraftState {
  tableId:       string | null;
  orderType:     PosOrderType;
  customerName?: string;
  delivery:      DeliveryDraft;
  items:         DraftItem[];

  addItem:          (item: Omit<DraftItem, 'quantity' | 'notes'>) => void;
  setQuantity:      (productId: string, quantity: number) => void;
  setNotes:         (productId: string, notes: string) => void;
  setCustomerName:  (name: string) => void;
  setDeliveryField: (field: keyof DeliveryDraft, value: string) => void;
  setTable:         (tableId: string) => void;
  setOrderType:     (type: PosOrderType) => void;
  clear:            () => void;
}

const MAX_QTY = 99; // mismo límite que valida el servidor

export const usePosDraftStore = create<PosDraftState>()((set) => ({
  tableId:      null,
  orderType:    'DINE_IN',
  customerName: undefined,
  delivery:     EMPTY_DELIVERY,
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

  setDeliveryField: (field, value) => set((s) => ({ delivery: { ...s.delivery, [field]: value } })),

  // Cambiar de mesa empieza un borrador nuevo
  setTable: (tableId) => set({ tableId, orderType: 'DINE_IN', customerName: undefined, delivery: EMPTY_DELIVERY, items: [] }),

  // Para llevar y A domicilio empiezan un borrador nuevo sin mesa
  setOrderType: (type) =>
    set(type === 'DINE_IN'
      ? { orderType: 'DINE_IN' }
      : { orderType: type, tableId: null, customerName: undefined, delivery: EMPTY_DELIVERY, items: [] }),

  clear: () => set({ items: [], delivery: EMPTY_DELIVERY, customerName: undefined }),
}));

// Total del borrador, solo para mostrar (el total oficial lo calcula el servidor)
export const selectDraftTotal = (s: PosDraftState) =>
  s.items.reduce((sum, i) => sum + i.unitPrice * i.quantity, 0);

export const selectDraftCount = (s: PosDraftState) =>
  s.items.reduce((sum, i) => sum + i.quantity, 0);
