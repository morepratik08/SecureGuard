import { Router } from 'express';
import { authenticate, authorizeRoles } from '../middleware/auth.middleware.js';
import { createIncidentController, getIncidentController, incidentReportSitesController, incidentSummaryController, listIncidentsController, updateIncidentController, updateIncidentStatusController } from '../controllers/incident.controller.js';

const router = Router();
const readers = [authenticate, authorizeRoles('SUPER_ADMIN', 'ADMIN', 'SUPERVISOR', 'GUARD', 'CLIENT')];
const managers = [authenticate, authorizeRoles('SUPER_ADMIN', 'ADMIN', 'SUPERVISOR')];
router.get('/summary', ...readers, incidentSummaryController);
router.get('/sites', ...readers, incidentReportSitesController);
router.get('/', ...readers, listIncidentsController);
router.post('/', authenticate, authorizeRoles('SUPER_ADMIN', 'ADMIN', 'SUPERVISOR', 'GUARD', 'CLIENT'), createIncidentController);
router.get('/:incidentId', ...readers, getIncidentController);
router.patch('/:incidentId', ...managers, updateIncidentController);
router.patch('/:incidentId/status', ...managers, updateIncidentStatusController);
export default router;
