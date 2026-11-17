import { Router } from 'express';
import { listExpenses, createExpense, updateExpense, deleteExpense } from '../controllers/expenses.controller';
import { authenticate, authorize } from '../middlewares/auth.middleware';

// Gastos: solo ADMIN
const router = Router();
router.use(authenticate, authorize('ADMIN'));

router.get('/',       listExpenses);
router.post('/',      createExpense);
router.patch('/:id',  updateExpense);
router.delete('/:id', deleteExpense);

export default router;
