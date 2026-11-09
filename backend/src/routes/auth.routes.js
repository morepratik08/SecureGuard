import { Router } from 'express';
import { changePasswordController, currentUserController, loginController } from '../controllers/auth.controller.js';
import { authenticate } from '../middleware/auth.middleware.js';
import { loginRateLimit } from '../middleware/login-rate-limit.middleware.js';

const router = Router();

router.post('/login', loginRateLimit, loginController);
router.get('/me', authenticate, currentUserController);
router.post('/change-password', authenticate, changePasswordController);

export default router;
