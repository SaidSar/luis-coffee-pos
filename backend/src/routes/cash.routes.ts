import { Router } from 'express';
import { getCurrent, openShift, closeShift, listShifts } from '../controllers/cash.controller';
import { authenticate, authorize } from '../middlewares/auth.middleware';

// Caja: CASHIER y ADMIN. El historial de cortes, solo ADMIN.
// Los turnos cerrados son inmutables: no hay rutas de edición ni borrado.
const router = Router();
router.use(authenticate, authorize('ADMIN', 'CASHIER'));

router.get('/current', getCurrent);
router.post('/open',   openShift);
router.post('/close',  closeShift);
router.get('/shifts',  authorize('ADMIN'), listShifts);

export default router;
