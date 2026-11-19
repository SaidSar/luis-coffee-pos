import { Router } from 'express';
import {
  listEmployees, getEmployee, createEmployee, updateEmployee,
  deactivateEmployee, activateEmployee, resetPassword, registerPayroll,
} from '../controllers/employees.controller';
import { authenticate, authorize } from '../middlewares/auth.middleware';

// Empleados: solo ADMIN. No hay DELETE: los usuarios se desactivan, nunca se borran.
const router = Router();
router.use(authenticate, authorize('ADMIN'));

router.get('/',                    listEmployees);
router.get('/:id',                 getEmployee);
router.post('/',                   createEmployee);
router.patch('/:id',               updateEmployee);
router.post('/:id/deactivate',     deactivateEmployee);
router.post('/:id/activate',       activateEmployee);
router.post('/:id/reset-password', resetPassword);
router.post('/:id/payroll',        registerPayroll);

export default router;
