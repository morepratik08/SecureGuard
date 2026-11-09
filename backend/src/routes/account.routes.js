import { Router } from 'express';
import { createAccountController, resetPasswordController } from '../controllers/account.controller.js';
import { authenticate, authorizeRoles } from '../middleware/auth.middleware.js';

const router = Router();
const administratorsOnly = [authenticate, authorizeRoles('ADMIN', 'SUPER_ADMIN')];

router.post('/', ...administratorsOnly, createAccountController);
router.post('/:userId/reset-password', ...administratorsOnly, resetPasswordController);

export default router;
