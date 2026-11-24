import { documentExpirySummary, getDocument, listDocuments, STORAGE_UNAVAILABLE_MESSAGE, updateDocument } from '../services/document.service.js';
import { validateDocumentListQuery, validateDocumentUpdate } from '../validators/document.validator.js';
import { parseAccountId } from '../validators/account.validator.js';
import { HttpError } from '../utils/http-error.js';

export async function listDocumentsController(req, res) {
  res.json({ success: true, ...(await listDocuments(req.user, validateDocumentListQuery(req.query, req.user.role))) });
}
export async function getDocumentController(req, res) {
  const id = parseAccountId(req.params.documentId);
  if (!id) throw new HttpError(400, 'A valid document ID is required.');
  res.json({ success: true, document: await getDocument(req.user, id.toString()) });
}
export async function updateDocumentController(req, res) {
  const document = await updateDocument({ actor: req.user, documentId: req.params.documentId, input: validateDocumentUpdate(req.body) });
  res.json({ success: true, document });
}
export async function documentSummaryController(req, res) {
  res.json({ success: true, summary: await documentExpirySummary(req.user) });
}
export async function uploadDocumentController(req, res) {
  res.status(503).json({ success: false, message: STORAGE_UNAVAILABLE_MESSAGE });
}
export async function downloadDocumentController(req, res) {
  const id = parseAccountId(req.params.documentId);
  if (!id) throw new HttpError(400, 'A valid document ID is required.');
  await getDocument(req.user, id.toString());
  res.status(503).json({ success: false, message: STORAGE_UNAVAILABLE_MESSAGE });
}
