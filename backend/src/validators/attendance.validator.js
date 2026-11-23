import { HttpError } from '../utils/http-error.js';
import { parseAccountId } from './account.validator.js';

const STATUSES = new Set(['PRESENT', 'ABSENT', 'LATE', 'HALF_DAY', 'ON_LEAVE']);
function invalid(message = 'Invalid attendance request.') { throw new HttpError(400, message); }

function date(value, label) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) invalid(`${label} must use YYYY-MM-DD.`);
  const result = new Date(`${value}T00:00:00.000Z`);
  if (Number.isNaN(result.getTime()) || result.toISOString().slice(0, 10) !== value) invalid(`${label} is invalid.`);
  return result;
}

export function validateCheckIn(body) {
  if (!body || typeof body !== 'object' || Array.isArray(body)
    || Object.keys(body).length !== 1 || !Object.hasOwn(body, 'assignment_id')) invalid('assignment_id is required.');
  const assignmentId = parseAccountId(String(body.assignment_id));
  if (!assignmentId) invalid('assignment_id is invalid.');
  return { assignmentId };
}

export function validateAttendanceListQuery(query) {
  const page = query.page === undefined ? 1 : Number(query.page);
  const pageSize = query.pageSize === undefined ? 20 : Number(query.pageSize);
  if (!Number.isSafeInteger(page) || page < 1 || page > 10001
    || !Number.isSafeInteger(pageSize) || pageSize < 1 || pageSize > 100
    || (page - 1) * pageSize > 10000) invalid('Pagination is invalid.');
  const result = { page, pageSize };
  for (const [key, label] of [['guardId', 'Guard ID'], ['siteId', 'Site ID'], ['shiftId', 'Shift ID']]) {
    if (query[key] !== undefined) {
      const id = parseAccountId(String(query[key]));
      if (!id) invalid(`${label} is invalid.`);
      result[key] = id;
    }
  }
  for (const key of ['from', 'to']) if (query[key] !== undefined) result[key] = date(query[key], key === 'from' ? 'Start date' : 'End date');
  if (result.from && result.to && result.from > result.to) invalid('End date must be on or after start date.');
  if (result.from && result.to && result.to - result.from > 366 * 86_400_000) invalid('Attendance date range cannot exceed 367 days.');
  if (query.status !== undefined) {
    if (!STATUSES.has(query.status)) invalid('Attendance status is invalid.');
    result.status = query.status;
  }
  if (query.search !== undefined) {
    if (typeof query.search !== 'string' || query.search.trim().length > 100) invalid('Search text must be at most 100 characters.');
    result.search = query.search.trim();
  }
  return result;
}

export function validateAbsenceGeneration(body) {
  if (!body || typeof body !== 'object' || Array.isArray(body)
    || Object.keys(body).some((key) => key !== 'date') || !Object.hasOwn(body, 'date')) invalid('date is required.');
  return date(body.date, 'Attendance date');
}
