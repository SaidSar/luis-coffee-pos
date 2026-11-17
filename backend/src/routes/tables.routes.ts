import { Router } from 'express';
import { getTables, createTable, updateTable } from '../controllers/tables.controller';
import { authenticate, authorize } from '../middlewares/auth.middleware';

const router = Router();

router.get('/',      authenticate,                     getTables);
router.post('/',     authenticate, authorize('ADMIN'), createTable);
router.patch('/:id', authenticate, authorize('ADMIN'), updateTable);

export default router;
