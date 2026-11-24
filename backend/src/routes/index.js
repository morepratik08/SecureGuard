import { Router } from 'express';
import accountRoutes from './account.routes.js';
import authRoutes from './auth.routes.js';
import healthRoutes from './health.routes.js';
import employeeRoutes from './employee.routes.js';
import clientRoutes from './client.routes.js';
import siteRoutes from './site.routes.js';
import shiftRoutes from './shift.routes.js';
import assignmentRoutes from './assignment.routes.js';
import scheduleRoutes from './schedule.routes.js';
import attendanceRoutes from './attendance.routes.js';
import leaveRoutes from './leave.routes.js';
import incidentRoutes from './incident.routes.js';
import documentRoutes from './document.routes.js';

const router = Router();

router.use('/auth', authRoutes);
router.use('/accounts', accountRoutes);
router.use('/employees', employeeRoutes);
router.use('/clients', clientRoutes);
router.use('/sites', siteRoutes);
router.use('/shifts', shiftRoutes);
router.use('/assignments', assignmentRoutes);
router.use('/schedule', scheduleRoutes);
router.use('/attendance', attendanceRoutes);
router.use('/leaves', leaveRoutes);
router.use('/incidents', incidentRoutes);
router.use('/documents', documentRoutes);
router.use(healthRoutes);

export default router;
