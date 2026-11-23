import { Router } from 'express';
import { authenticate, authorizeRoles } from '../middleware/auth.middleware.js';
import { scheduleController } from '../controllers/assignment.controller.js';

const router = Router();
router.get('/', authenticate, authorizeRoles('SUPER_ADMIN', 'ADMIN', 'SUPERVISOR'), scheduleController);
export default router;
