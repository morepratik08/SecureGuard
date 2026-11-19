import { Router } from 'express';
import { authenticate, authorizeRoles } from '../middleware/auth.middleware.js';
import { createSiteController, getSiteController, listSitesController, siteOptionsController, updateSiteController, updateSiteStatusController } from '../controllers/site.controller.js';

const router = Router();
const admins = [authenticate, authorizeRoles('SUPER_ADMIN', 'ADMIN')];
const readers = [authenticate, authorizeRoles('SUPER_ADMIN', 'ADMIN', 'SUPERVISOR', 'CLIENT')];
router.get('/options', ...admins, siteOptionsController);
router.get('/', ...readers, listSitesController);
router.post('/', ...admins, createSiteController);
router.get('/:siteId', ...readers, getSiteController);
router.put('/:siteId', ...admins, updateSiteController);
router.patch('/:siteId/status', ...admins, updateSiteStatusController);
export default router;
