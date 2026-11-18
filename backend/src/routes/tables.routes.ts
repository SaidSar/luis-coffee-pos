import { Router } from 'express';
import { getTables, createTable, updateTable, mergeTables, unmergeTable } from '../controllers/tables.controller';
import { authenticate, authorize } from '../middlewares/auth.middleware';

const router = Router();
const staff = [authenticate, authorize('ADMIN', 'CASHIER', 'WAITER')] as const;

router.get('/',             authenticate,                     getTables);
router.post('/',            authenticate, authorize('ADMIN'), createTable);
router.patch('/:id',        authenticate, authorize('ADMIN'), updateTable);
// Juntar y separar mesas: personal operativo
router.post('/:id/merge',   ...staff, mergeTables);
router.post('/:id/unmerge', ...staff, unmergeTable);

export default router;
