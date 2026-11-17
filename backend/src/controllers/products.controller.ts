import { Request, Response } from 'express';
import { prisma } from '../lib/prisma';
import { uploadImage, deleteImage } from '../services/cloudinary.service';
//import { scanMenuImage } from '../services/anthropic.service';
import { scanMenuImage, AI_SERVICE_UNAVAILABLE, AI_INVALID_RESPONSE } from '../services/gemini.service';

const include = { category: true };

// trackStock llega como string en multipart ('true'/'false') o como boolean en JSON.
// Cualquier otro valor (o ausente) devuelve undefined.
const parseTrackStock = (v: unknown): boolean | undefined =>
  v === true || v === 'true' ? true : v === false || v === 'false' ? false : undefined;

export const getProducts = async (_: Request, res: Response) => {
  const data = await prisma.product.findMany({ include, orderBy: { name: 'asc' } });
  res.json(data);
};

export const getProduct = async (req: Request, res: Response) => {
  const id = String(req.params.id);
  const data = await prisma.product.findUnique({ where: { id }, include });
  if (!data) return res.status(404).json({ message: 'Producto no encontrado' });
  res.json(data);
};

export const createProduct = async (req: Request, res: Response) => {
  try {
    const { name, description, price, cost, stock, categoryId, isAvailable, trackStock } = req.body;

    let imageUrl: string | undefined;
    if (req.file) imageUrl = await uploadImage(req.file.buffer, 'luis-coffee/products');

    const product = await prisma.product.create({
      data: {
        name, description,
        price:       parseFloat(price),
        cost:        parseFloat(cost),
        stock:       parseInt(stock) || 0,
        // Ausente → false (p. ej. la importación del escaneo con IA no lo envía)
        trackStock:  parseTrackStock(trackStock) ?? false,
        categoryId,
        isAvailable: isAvailable !== 'false',
        imageUrl,
      },
      include,
    });

    res.status(201).json(product);
  } catch (err) {
    console.error('[createProduct]', err);
    res.status(500).json({ message: 'Error al crear producto' });
  }
};

export const updateProduct = async (req: Request, res: Response) => {
  try {
    const id = String(req.params.id);
    const { name, description, price, cost, stock, categoryId, isAvailable, trackStock } = req.body;

    const existing = await prisma.product.findUnique({ where: { id } });
    if (!existing) return res.status(404).json({ message: 'Producto no encontrado' });

    let imageUrl = existing.imageUrl ?? undefined;
    if (req.file) {
      if (existing.imageUrl) await deleteImage(existing.imageUrl);
      imageUrl = await uploadImage(req.file.buffer, 'luis-coffee/products');
    }

    const product = await prisma.product.update({
      where: { id },
      data: {
        name, description,
        price:       parseFloat(price),
        cost:        parseFloat(cost),
        stock:       parseInt(stock),
        // Ausente → se conserva el valor actual (el formulario actual aún no lo envía)
        trackStock:  parseTrackStock(trackStock),
        categoryId,
        isAvailable: isAvailable !== 'false',
        imageUrl,
      },
      include,
    });

    res.json(product);
  } catch (err) {
    console.error('[updateProduct]', err);
    res.status(500).json({ message: 'Error al actualizar producto' });
  }
};

export const toggleAvailability = async (req: Request, res: Response) => {
  const id = String(req.params.id);
  const existing = await prisma.product.findUnique({ where: { id } });
  if (!existing) return res.status(404).json({ message: 'Producto no encontrado' });

  const product = await prisma.product.update({
    where: { id },
    data:  { isAvailable: !existing.isAvailable },
  });
  res.json(product);
};

export const deleteProduct = async (req: Request, res: Response) => {
  try {
    const id = String(req.params.id);
    const existing = await prisma.product.findUnique({ where: { id } });
    if (!existing) return res.status(404).json({ message: 'Producto no encontrado' });

    if (existing.imageUrl) await deleteImage(existing.imageUrl);
    await prisma.product.delete({ where: { id } });
    res.json({ message: 'Producto eliminado' });
  } catch (err) {
    res.status(500).json({ message: 'Error al eliminar producto' });
  }
};

// ── IA: Escanear foto del menú con Gemini ───────────────────────────────
export const scanMenu = async (req: Request, res: Response) => {
  try {
    if (!req.file) {
      return res.status(400).json({ message: 'Imagen requerida' });
    }

    const base64Image = req.file.buffer.toString('base64');
    const aiResult = await scanMenuImage(base64Image, req.file.mimetype);

    // El modal espera un arreglo de platillos
    return res.json(Array.isArray(aiResult?.items) ? aiResult.items : []);
  } catch (err: unknown) {
    const code = err instanceof Error ? err.message : '';

    // Estos fallos ya los registra gemini.service
    if (code === AI_SERVICE_UNAVAILABLE) {
      return res.status(503).json({ message: 'El servicio de IA no está disponible. Inténtalo más tarde.' });
    }
    if (code === AI_INVALID_RESPONSE) {
      return res.status(502).json({ message: 'La IA devolvió una respuesta no válida. Intenta con otra foto.' });
    }

    console.error('[scanMenu] Error inesperado:', err);
    return res.status(500).json({ message: 'Error al analizar el menú con IA' });
  }
};