import { Router } from 'express';
import { register, login, getMe } from '../controllers/auth.controller';
import { authenticate } from '../middlewares/auth.middleware';

const router = Router();

router.post('/register', register);   // POST /api/auth/register
router.post('/login',    login);      // POST /api/auth/login
router.get('/me', authenticate, getMe); // GET /api/auth/me  🔒

export default router;