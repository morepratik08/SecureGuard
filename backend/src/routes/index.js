import { Router } from 'express';
import accountRoutes from './account.routes.js';
import authRoutes from './auth.routes.js';
import healthRoutes from './health.routes.js';

const router = Router();

router.use('/auth', authRoutes);
router.use('/accounts', accountRoutes);
router.use(healthRoutes);

export default router;
