import { Router } from 'express';
import { authenticate, authorizeRoles } from '../middleware/auth.middleware.js';
import { assignmentOptionsController, createAssignmentController, endAssignmentController, getAssignmentController, listAssignmentsController, updateAssignmentController } from '../controllers/assignment.controller.js';

const router = Router();
const readers = [authenticate, authorizeRoles('SUPER_ADMIN', 'ADMIN', 'SUPERVISOR')];
const admins = [authenticate, authorizeRoles('SUPER_ADMIN', 'ADMIN')];
router.get('/', ...readers, listAssignmentsController);
router.get('/options', ...readers, assignmentOptionsController);
router.post('/', ...admins, createAssignmentController);
router.get('/:assignmentId', ...readers, getAssignmentController);
router.put('/:assignmentId', ...admins, updateAssignmentController);
router.patch('/:assignmentId/end', ...admins, endAssignmentController);
export default router;
