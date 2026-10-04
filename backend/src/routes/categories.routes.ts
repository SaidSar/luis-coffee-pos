import { Router } from 'express';
import { getCategories, createCategory, deleteCategory } from '../controllers/categories.controller';
import { authenticate, authorize } from '../middlewares/auth.middleware';

const router = Router();

router.get('/',       authenticate,                        getCategories);
router.post('/',      authenticate, authorize('ADMIN'),    createCategory);
router.delete('/:id', authenticate, authorize('ADMIN'),    deleteCategory);

export default router;