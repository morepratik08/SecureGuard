import { Router } from 'express';
import {
  createEmployeeController,
  employeeSummaryController,
  getEmployeeController,
  listEmployeesController,
  myEmployeeProfileController,
  updateEmployeeController,
  updateEmployeeStatusController,
} from '../controllers/employee.controller.js';
import { authenticate, authorizeRoles } from '../middleware/auth.middleware.js';

const router = Router();
const adminOnly = [authenticate, authorizeRoles('SUPER_ADMIN', 'ADMIN')];
const readers = [authenticate, authorizeRoles('SUPER_ADMIN', 'ADMIN', 'SUPERVISOR', 'GUARD')];
const listReaders = [authenticate, authorizeRoles('SUPER_ADMIN', 'ADMIN', 'SUPERVISOR')];

router.get('/summary', ...listReaders, employeeSummaryController);
router.get('/me', authenticate, authorizeRoles('SUPERVISOR', 'GUARD'), myEmployeeProfileController);
router.get('/', ...listReaders, listEmployeesController);
router.post('/', ...adminOnly, createEmployeeController);
router.get('/:employeeId', ...readers, getEmployeeController);
router.patch('/:employeeId', ...adminOnly, updateEmployeeController);
router.patch('/:employeeId/status', ...adminOnly, updateEmployeeStatusController);

export default router;
