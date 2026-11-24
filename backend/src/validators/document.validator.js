import { HttpError } from '../utils/http-error.js';
import { parseAccountId } from './account.validator.js';

const VERIFICATION = new Set(['PENDING', 'VERIFIED', 'REJECTED']);
function invalid(message = 'Invalid document details.') { throw new HttpError(400, message); }
function id(value, label) {
  const parsed = parseAccountId(String(value ?? ''));
  if (!parsed) invalid(`${label} is invalid.`);
  return parsed;
}
export function validateDocumentListQuery(query, role) {
  const guardId = query.guardId === undefined ? undefined : id(query.guardId, 'Guard ID');
  if (guardId && !['ADMIN', 'SUPER_ADMIN', 'SUPERVISOR'].includes(role)) throw new HttpError(403, 'Document filters are restricted to authorized staff.');
  const verificationStatus = query.verificationStatus || undefined;
  if (verificationStatus && !VERIFICATION.has(verificationStatus)) invalid('Verification status filter is invalid.');
  const search = typeof query.search === 'string' ? query.search.trim() : '';
  if (search.length > 100) invalid('Search must be at most 100 characters.');
  if (query.expiry || query.expiringWithinDays) throw new HttpError(400, 'Document expiry cannot be filtered because the current schema has no expiry field.');
  const page = query.page === undefined ? 1 : Number(query.page);
  const pageSize = query.pageSize === undefined ? 20 : Number(query.pageSize);
  if (!Number.isSafeInteger(page) || page < 1 || page > 10001 || !Number.isSafeInteger(pageSize) || pageSize < 1 || pageSize > 100 || (page - 1) * pageSize > 10000) invalid('Pagination is invalid.');
  return { guardId, verificationStatus, search, page, pageSize };
}
export function validateDocumentUpdate(body) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) invalid();
  const permitted = new Set(['document_type']);
  if (!Object.keys(body).length || Object.keys(body).some((key) => !permitted.has(key))) invalid('Only the document type can be changed while private file review is unavailable.');
  const result = {};
  if (Object.hasOwn(body, 'document_type')) {
    if (typeof body.document_type !== 'string' || !body.document_type.trim() || body.document_type.trim().length > 50) invalid('Document type is invalid.');
    result.document_type = body.document_type.trim();
  }
  return result;
}
