import { Router } from 'express';
import { authenticate, authorizeRoles } from '../middleware/auth.middleware.js';
import { documentSummaryController, downloadDocumentController, getDocumentController, listDocumentsController, updateDocumentController, uploadDocumentController } from '../controllers/document.controller.js';

const router = Router();
const readers = [authenticate, authorizeRoles('SUPER_ADMIN', 'ADMIN', 'SUPERVISOR', 'GUARD')];
router.get('/summary', ...readers, documentSummaryController);
router.get('/', ...readers, listDocumentsController);
router.post('/upload', authenticate, authorizeRoles('SUPER_ADMIN', 'ADMIN'), uploadDocumentController);
router.get('/:documentId', ...readers, getDocumentController);
router.get('/:documentId/download', ...readers, downloadDocumentController);
router.patch('/:documentId', authenticate, authorizeRoles('SUPER_ADMIN', 'ADMIN'), updateDocumentController);
export default router;
