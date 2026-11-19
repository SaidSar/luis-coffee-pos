import { Router } from 'express';
import { login, getMe, changePassword } from '../controllers/auth.controller';
import { authenticate } from '../middlewares/auth.middleware';

const router = Router();

router.post('/login',           login);                       // POST /api/auth/login
router.get('/me',               authenticate, getMe);         // GET  /api/auth/me 🔒
router.post('/change-password', authenticate, changePassword); // POST /api/auth/change-password 🔒

export default router;
