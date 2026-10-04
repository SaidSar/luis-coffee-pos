import api from './api';
import type { Category, Product, ScannedProduct } from '../types';

export const categoryService = {
  list:   ()           => api.get<Category[]>('/categories').then(r => r.data),
  create: (name: string) => api.post<Category>('/categories', { name }).then(r => r.data),
  remove: (id: string) => api.delete(`/categories/${id}`).then(r => r.data),
};

const multipart = { headers: { 'Content-Type': 'multipart/form-data' } };

export const productService = {
  list:   () => api.get<Product[]>('/products').then(r => r.data),

  create: (data: FormData) =>
    api.post<Product>('/products', data, multipart).then(r => r.data),

  update: (id: string, data: FormData) =>
    api.put<Product>(`/products/${id}`, data, multipart).then(r => r.data),

  toggle: (id: string) =>
    api.patch<Product>(`/products/${id}/toggle`).then(r => r.data),

  remove: (id: string) => api.delete(`/products/${id}`).then(r => r.data),

  scanMenu: (image: File): Promise<ScannedProduct[]> => {
    const form = new FormData();
    form.append('image', image);
    return api.post<ScannedProduct[]>('/products/scan-menu', form, multipart).then(r => r.data);
  },
};