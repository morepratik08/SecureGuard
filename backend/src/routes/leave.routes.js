import { Router } from 'express';
import { authenticate, authorizeRoles } from '../middleware/auth.middleware.js';
import { approveLeaveController, applyLeaveController, getLeaveController, listLeavesController, myLeavesController, rejectLeaveController } from '../controllers/leave.controller.js';

const router = Router();
const readers = [authenticate, authorizeRoles('SUPER_ADMIN', 'ADMIN', 'SUPERVISOR', 'GUARD')];
const admins = [authenticate, authorizeRoles('SUPER_ADMIN', 'ADMIN')];
router.post('/', authenticate, authorizeRoles('GUARD'), applyLeaveController);
router.get('/me', authenticate, authorizeRoles('GUARD'), myLeavesController);
router.get('/', ...readers, listLeavesController);
router.get('/:leaveId', ...readers, getLeaveController);
router.patch('/:leaveId/approve', ...admins, approveLeaveController);
router.patch('/:leaveId/reject', ...admins, rejectLeaveController);
export default router;
