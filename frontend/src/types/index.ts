export type Role = 'ADMIN' | 'CASHIER' | 'WAITER' | 'DELIVERY';

export interface User {
  id:        string;
  name:      string;
  email:     string;
  role:      Role;
  createdAt: string;
}

export interface AuthResponse {
  user:  User;
  token: string;
}


export interface Category {
  id:     string;
  name:   string;
  _count?: { products: number };
}

export interface Product {
  id:          string;
  name:        string;
  description: string | null;
  price:       string | number;
  cost:        string | number;
  stock:       number;
  trackStock:  boolean;  // si es false, el stock no se valida ni bloquea la venta
  imageUrl:    string | null;
  isAvailable: boolean;
  categoryId:  string;
  category:    Category;
}

export interface ScannedProduct {
  name:     string;
  price:    number;
  category: string;
  extras:   string[];
}

// Helper: Decimal de Prisma llega como string en JSON
export const toNum = (v: string | number | unknown): number =>
  parseFloat(String(v));

export const formatMXN = (v: string | number | unknown): string =>
  `$${toNum(v).toFixed(2)}`;