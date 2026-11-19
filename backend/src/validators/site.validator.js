import { HttpError } from '../utils/http-error.js';
import { parseAccountId } from './account.validator.js';

const STATUSES = new Set(['ACTIVE', 'INACTIVE']);
const FIELDS = new Set(['site_name', 'address', 'client_id', 'supervisor_id', 'required_guards']);
function invalid(message = 'Invalid site details.') { throw new HttpError(400, message); }
function id(value, label, optional = false) {
  if (optional && (value === null || value === '')) return null;
  const parsed = parseAccountId(String(value ?? ''));
  if (!parsed) invalid(`${label} is invalid.`);
  return parsed;
}
function text(value, max, label) {
  if (typeof value !== 'string' || !value.trim() || value.trim().length > max) invalid(`${label} is invalid.`);
  return value.trim();
}
export function validateSiteInput(body, { partial = false } = {}) {
  if (!body || typeof body !== 'object' || Array.isArray(body) || Object.keys(body).some((key) => !FIELDS.has(key)) || (!partial && !Object.keys(body).length)) invalid();
  if (partial && !Object.keys(body).length) invalid();
  const value = {};
  if (!partial || Object.hasOwn(body, 'site_name')) value.site_name = text(body.site_name, 150, 'Site name');
  if (!partial || Object.hasOwn(body, 'address')) value.address = text(body.address, 5000, 'Address');
  if (!partial || Object.hasOwn(body, 'client_id')) value.client_id = id(body.client_id, 'Client ID');
  if (Object.hasOwn(body, 'supervisor_id')) value.supervisor_id = id(body.supervisor_id, 'Supervisor ID', true);
  if (Object.hasOwn(body, 'required_guards')) {
    const count = Number(body.required_guards);
    if (!Number.isInteger(count) || count < 1 || count > 4_294_967_295) invalid('Required guards must be a positive whole number.');
    value.required_guards = count;
  } else if (!partial) value.required_guards = 1;
  return value;
}
export function validateSiteStatus(value) {
  if (!STATUSES.has(value)) invalid('Site status is invalid.');
  return value;
}
export function validateSiteListQuery(query, actorRole) {
  const search = typeof query.search === 'string' ? query.search.trim() : '';
  const status = query.status || undefined;
  if (search.length > 100) invalid('Search must be at most 100 characters.');
  if (status && !STATUSES.has(status)) invalid('Site status filter is invalid.');
  const clientId = query.clientId === undefined ? undefined : id(query.clientId, 'Client ID');
  const supervisorId = query.supervisorId === undefined ? undefined : id(query.supervisorId, 'Supervisor ID');
  if (actorRole === 'CLIENT' && (clientId || supervisorId)) throw new HttpError(403, 'Client site filters are restricted to the organization.');
  if (actorRole === 'SUPERVISOR' && (clientId || supervisorId)) throw new HttpError(403, 'Supervisor site filters are restricted to assigned sites.');
  const page = query.page === undefined ? 1 : Number(query.page);
  const pageSize = query.pageSize === undefined ? 20 : Number(query.pageSize);
  if (!Number.isSafeInteger(page) || page < 1 || page > 10001 || !Number.isSafeInteger(pageSize) || pageSize < 1 || pageSize > 100 || (page - 1) * pageSize > 10000) invalid('Pagination is invalid.');
  return { search, status, clientId, supervisorId, page, pageSize };
}
