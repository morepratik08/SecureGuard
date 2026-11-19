import { Router } from 'express';
import { authenticate, authorizeRoles } from '../middleware/auth.middleware.js';
import { createClientController, getClientController, getMyClientController, listClientsController, updateClientController, updateClientStatusController, updateMyClientController } from '../controllers/client.controller.js';

const router = Router();
const admins = [authenticate, authorizeRoles('SUPER_ADMIN', 'ADMIN')];
router.get('/me', authenticate, authorizeRoles('CLIENT'), getMyClientController);
router.put('/me', authenticate, authorizeRoles('CLIENT'), updateMyClientController);
router.get('/', authenticate, authorizeRoles('SUPER_ADMIN', 'ADMIN', 'CLIENT'), listClientsController);
router.post('/', ...admins, createClientController);
router.get('/:clientId', authenticate, authorizeRoles('SUPER_ADMIN', 'ADMIN', 'CLIENT'), getClientController);
router.put('/:clientId', authenticate, authorizeRoles('SUPER_ADMIN', 'ADMIN', 'CLIENT'), updateClientController);
router.patch('/:clientId/status', ...admins, updateClientStatusController);
export default router;
