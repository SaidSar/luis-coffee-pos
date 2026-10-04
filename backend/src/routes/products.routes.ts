import { Router } from 'express';
import {
  getProducts, getProduct, createProduct,
  updateProduct, toggleAvailability, deleteProduct, scanMenu,
} from '../controllers/products.controller';
import { authenticate, authorize } from '../middlewares/auth.middleware';
import { upload } from '../middlewares/upload.middleware';

const router = Router();
const admin  = [authenticate, authorize('ADMIN')] as const;

// ⚠️ Rutas específicas antes que /:id
router.post('/scan-menu',    ...admin, upload.single('image'), scanMenu);

router.get('/',              authenticate,                      getProducts);
router.get('/:id',           authenticate,                      getProduct);
router.post('/',             ...admin,  upload.single('image'), createProduct);
router.put('/:id',           ...admin,  upload.single('image'), updateProduct);
router.patch('/:id/toggle',  ...admin,                          toggleAvailability);
router.delete('/:id',        ...admin,                          deleteProduct);

export default router;