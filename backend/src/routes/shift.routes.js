import { Router } from 'express';
import { authenticate, authorizeRoles } from '../middleware/auth.middleware.js';
import { createShiftController, getShiftController, listShiftsController, updateShiftController, updateShiftStatusController } from '../controllers/shift.controller.js';

const router = Router();
const readers = [authenticate, authorizeRoles('SUPER_ADMIN', 'ADMIN', 'SUPERVISOR')];
const admins = [authenticate, authorizeRoles('SUPER_ADMIN', 'ADMIN')];
router.get('/', ...readers, listShiftsController);
router.post('/', ...admins, createShiftController);
router.get('/:shiftId', ...readers, getShiftController);
router.put('/:shiftId', ...admins, updateShiftController);
router.patch('/:shiftId/status', ...admins, updateShiftStatusController);
export default router;
