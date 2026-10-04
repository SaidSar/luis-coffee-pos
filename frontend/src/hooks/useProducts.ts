import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { categoryService, productService } from '../services/productService';

const PRODUCTS   = ['products'];
const CATEGORIES = ['categories'];

// ── Categorías ────────────────────────────────────────────────
export const useCategories = () =>
  useQuery({ queryKey: CATEGORIES, queryFn: categoryService.list });

export const useCreateCategory = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: categoryService.create,
    onSuccess:  () => qc.invalidateQueries({ queryKey: CATEGORIES }),
  });
};

export const useDeleteCategory = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: categoryService.remove,
    onSuccess:  () => qc.invalidateQueries({ queryKey: CATEGORIES }),
  });
};

// ── Productos ─────────────────────────────────────────────────
export const useProducts = () =>
  useQuery({ queryKey: PRODUCTS, queryFn: productService.list });

export const useCreateProduct = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: productService.create,
    onSuccess:  () => qc.invalidateQueries({ queryKey: PRODUCTS }),
  });
};

export const useUpdateProduct = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: FormData }) =>
      productService.update(id, data),
    onSuccess: () => qc.invalidateQueries({ queryKey: PRODUCTS }),
  });
};

export const useToggleProduct = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: productService.toggle,
    onSuccess:  () => qc.invalidateQueries({ queryKey: PRODUCTS }),
  });
};

export const useDeleteProduct = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: productService.remove,
    onSuccess:  () => qc.invalidateQueries({ queryKey: PRODUCTS }),
  });
};