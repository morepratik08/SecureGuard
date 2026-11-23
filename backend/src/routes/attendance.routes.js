import { Router } from 'express';
import { authenticate, authorizeRoles } from '../middleware/auth.middleware.js';
import {
  attendanceDashboardController, checkInController, checkOutController, generateAbsencesController,
  getAttendanceController, listAttendanceController, myAttendanceController, verifyAttendanceController,
} from '../controllers/attendance.controller.js';

const router = Router();
const readers = [authenticate, authorizeRoles('SUPER_ADMIN', 'ADMIN', 'SUPERVISOR', 'GUARD')];
router.post('/check-in', authenticate, authorizeRoles('GUARD'), checkInController);
router.post('/absences/generate', authenticate, authorizeRoles('SUPER_ADMIN', 'ADMIN', 'SUPERVISOR'), generateAbsencesController);
router.get('/dashboard', authenticate, authorizeRoles('SUPER_ADMIN', 'ADMIN', 'SUPERVISOR', 'GUARD'), attendanceDashboardController);
router.get('/me', authenticate, authorizeRoles('GUARD'), myAttendanceController);
router.get('/', ...readers, listAttendanceController);
router.get('/:attendanceId', ...readers, getAttendanceController);
router.patch('/:attendanceId/check-out', authenticate, authorizeRoles('GUARD'), checkOutController);
router.patch('/:attendanceId/verify', authenticate, authorizeRoles('SUPERVISOR'), verifyAttendanceController);
export default router;
