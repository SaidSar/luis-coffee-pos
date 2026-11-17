import { Router } from 'express';
import { listDeliveries, updateDeliveryStatus } from '../controllers/deliveries.controller';
import { authenticate, authorize } from '../middlewares/auth.middleware';

// Entregas: personal del POS. Crear entregas es POST /api/orders con type DELIVERY;
// cancelarlas es cancelar la orden (CASHIER/ADMIN).
const router = Router();
router.use(authenticate, authorize('ADMIN', 'CASHIER', 'WAITER'));

router.get('/',             listDeliveries);
router.patch('/:id/status', updateDeliveryStatus);

export default router;
