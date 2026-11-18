import { Router } from 'express';
import {
  getOrders, getOrder, createOrder, addItems, updateItem, deleteItem, updateStatus,
} from '../controllers/orders.controller';
import { payOrder, paySplitHandler } from '../controllers/payments.controller';
import { authenticate, authorize } from '../middlewares/auth.middleware';

const router = Router();

const staff   = [authenticate, authorize('ADMIN', 'CASHIER', 'WAITER')] as const;
const cashier = [authenticate, authorize('ADMIN', 'CASHIER')] as const;

router.get('/',                      ...staff,   getOrders);
router.get('/:id',                   ...staff,   getOrder);
router.post('/',                     ...staff,   createOrder);
router.post('/:id/items',            ...staff,   addItems);
router.patch('/:id/items/:itemId',   ...staff,   updateItem);
router.delete('/:id/items/:itemId',  ...staff,   deleteItem);
// CANCELLED además se restringe a ADMIN y CASHIER dentro del controlador
router.patch('/:id/status',          ...staff,   updateStatus);
router.post('/:id/payment',          ...cashier, payOrder);        // cobrar todo (cuerpo anterior o payments[])
router.post('/:id/splits/pay',       ...cashier, paySplitHandler); // cobrar una cuenta

export default router;
