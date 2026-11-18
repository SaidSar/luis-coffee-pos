import { Router } from 'express';
import { getStatus, getCurrent, openShift, closeShift, listShifts } from '../controllers/cash.controller';
import { authenticate, authorize } from '../middlewares/auth.middleware';

// Caja: CASHIER y ADMIN. El historial de cortes, solo ADMIN.
// Los turnos cerrados son inmutables: no hay rutas de edición ni borrado.
const router = Router();
// Estado abierto/cerrado (sin montos) para todo el personal; va antes del filtro CASHIER/ADMIN
router.get('/status', authenticate, authorize('ADMIN', 'CASHIER', 'WAITER'), getStatus);
router.use(authenticate, authorize('ADMIN', 'CASHIER'));

router.get('/current', getCurrent);
router.post('/open',   openShift);
router.post('/close',  closeShift);
router.get('/shifts',  authorize('ADMIN'), listShifts);

export default router;
