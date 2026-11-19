import { Request, Response } from 'express';
import { sendError } from '../lib/http-error';
import { dashboard } from '../services/dashboard.service';

// ── GET /api/dashboard ──────────────────────────────────────
// Cualquier rol autenticado; los bloques de ventas y finanzas se omiten en el servidor según el rol
export const getDashboard = async (req: Request, res: Response) => {
  try {
    res.json(await dashboard(req.user!));
  } catch (err) {
    sendError(res, err, 'getDashboard');
  }
};
