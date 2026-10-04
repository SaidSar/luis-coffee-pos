import { Request, Response } from 'express';
import { prisma } from '../lib/prisma';

export const getCategories = async (_: Request, res: Response) => {
  const data = await prisma.category.findMany({
    include:  { _count: { select: { products: true } } },
    orderBy:  { name: 'asc' },
  });
  res.json(data);
};

export const createCategory = async (req: Request, res: Response) => {
  const { name } = req.body;
  if (!name?.trim()) return res.status(400).json({ message: 'El nombre es requerido' });

  const existing = await prisma.category.findUnique({ where: { name } });
  if (existing) return res.status(400).json({ message: 'Categoría ya existe' });

  const category = await prisma.category.create({ data: { name: name.trim() } });
  res.status(201).json(category);
};

export const deleteCategory = async (req: Request, res: Response) => {
  const categoryId = String(req.params.id);

  const count = await prisma.product.count({ where: { categoryId } });
  if (count > 0)
    return res.status(400).json({ message: `No se puede eliminar: tiene ${count} producto(s)` });

  await prisma.category.delete({ where: { id: categoryId } });
  res.json({ message: 'Categoría eliminada' });
};