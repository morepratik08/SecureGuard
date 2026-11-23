import { HttpError } from '../utils/http-error.js';
import { parseAccountId } from './account.validator.js';

const STATUSES = new Set(['PENDING', 'APPROVED', 'REJECTED']);
function invalid(message = 'Invalid leave request.') { throw new HttpError(400, message); }

function date(value, label) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) invalid(`${label} must use YYYY-MM-DD.`);
  const parsed = new Date(`${value}T00:00:00.000Z`);
  if (Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== value) invalid(`${label} is invalid.`);
  return parsed;
}

export function validateLeaveInput(body) {
  if (!body || typeof body !== 'object' || Array.isArray(body)
    || Object.keys(body).some((key) => !['start_date', 'end_date', 'reason'].includes(key))
    || !['start_date', 'end_date', 'reason'].every((key) => Object.hasOwn(body, key))) invalid();
  const startDate = date(body.start_date, 'Start date');
  const endDate = date(body.end_date, 'End date');
  if (endDate < startDate) invalid('End date must be on or after start date.');
  if (typeof body.reason !== 'string' || !body.reason.trim() || body.reason.trim().length > 5000) invalid('Reason is required and must be at most 5000 characters.');
  return { start_date: startDate, end_date: endDate, reason: body.reason.trim() };
}

export function validateLeaveListQuery(query) {
  const page = query.page === undefined ? 1 : Number(query.page);
  const pageSize = query.pageSize === undefined ? 20 : Number(query.pageSize);
  if (!Number.isSafeInteger(page) || page < 1 || page > 10001
    || !Number.isSafeInteger(pageSize) || pageSize < 1 || pageSize > 100
    || (page - 1) * pageSize > 10000) invalid('Pagination is invalid.');
  const result = { page, pageSize };
  if (query.status !== undefined) {
    if (!STATUSES.has(query.status)) invalid('Leave status is invalid.');
    result.status = query.status;
  }
  if (query.guardId !== undefined) {
    const id = parseAccountId(String(query.guardId));
    if (!id) invalid('Guard ID is invalid.');
    result.guardId = id;
  }
  for (const key of ['from', 'to']) if (query[key] !== undefined) result[key] = date(query[key], key === 'from' ? 'Start date' : 'End date');
  if (result.from && result.to && result.from > result.to) invalid('End date must be on or after start date.');
  if (result.from && result.to && result.to - result.from > 366 * 86_400_000) invalid('Leave date range cannot exceed 367 days.');
  if (query.search !== undefined) {
    if (typeof query.search !== 'string' || query.search.trim().length > 100) invalid('Search text must be at most 100 characters.');
    result.search = query.search.trim();
  }
  return result;
}

export function validateLeaveDecisionBody(body) {
  if (body === undefined) return;
  if (!body || typeof body !== 'object' || Array.isArray(body) || Object.keys(body).length !== 0) {
    invalid('Leave decision does not accept fields; rejection reasons are not supported by the database schema.');
  }
}
