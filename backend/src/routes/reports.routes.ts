import { Router } from 'express';
import {
  getSummary, getSales, getProducts, getCategories, getPaymentMethods, getEmployees, exportExcel,
} from '../controllers/reports.controller';
import { authenticate, authorize } from '../middlewares/auth.middleware';

// Reportes contables: solo ADMIN
const router = Router();
router.use(authenticate, authorize('ADMIN'));

router.get('/summary',         getSummary);
router.get('/sales',           getSales);
router.get('/products',        getProducts);
router.get('/categories',      getCategories);
router.get('/payment-methods', getPaymentMethods);
router.get('/employees',       getEmployees);
router.get('/export',          exportExcel);

export default router;
