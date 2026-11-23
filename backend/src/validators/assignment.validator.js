import { HttpError } from '../utils/http-error.js';
import { parseAccountId } from './account.validator.js';

const FIELDS = new Set(['guard_id', 'site_id', 'shift_id', 'start_date', 'end_date']);
function invalid(message = 'Invalid assignment details.') { throw new HttpError(400, message); }
function id(value, label, optional = false) {
  if (optional && (value === null || value === '')) return null;
  const parsed = parseAccountId(String(value ?? ''));
  if (!parsed) invalid(`${label} is invalid.`);
  return parsed;
}
function date(value, label, optional = false) {
  if (optional && (value === undefined || value === null || value === '')) return null;
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) invalid(`${label} must use YYYY-MM-DD.`);
  const parsed = new Date(`${value}T00:00:00.000Z`);
  if (Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== value) invalid(`${label} is invalid.`);
  return parsed;
}
function checkRange(startDate, endDate) {
  if (endDate && endDate < startDate) invalid('End date must be on or after start date.');
}
export function validateAssignmentInput(body, { partial = false } = {}) {
  if (!body || typeof body !== 'object' || Array.isArray(body) || !Object.keys(body).length || Object.keys(body).some((key) => !FIELDS.has(key))) invalid();
  if (!partial && !['guard_id', 'site_id', 'shift_id', 'start_date'].every((key) => Object.hasOwn(body, key))) invalid('Guard, site, shift, and start date are required.');
  const result = {};
  for (const [field, label] of [['guard_id', 'Guard ID'], ['site_id', 'Site ID'], ['shift_id', 'Shift ID']]) {
    if (Object.hasOwn(body, field)) result[field] = id(body[field], label);
  }
  if (Object.hasOwn(body, 'start_date')) result.start_date = date(body.start_date, 'Start date');
  if (Object.hasOwn(body, 'end_date')) result.end_date = date(body.end_date, 'End date', true);
  if (!partial) checkRange(result.start_date, result.end_date);
  return result;
}
export function validateAssignmentEnd(body) {
  if (!body || typeof body !== 'object' || Array.isArray(body) || Object.keys(body).some((key) => key !== 'end_date')) invalid();
  const endDate = body.end_date === undefined ? new Date(`${new Date().toISOString().slice(0, 10)}T00:00:00.000Z`) : date(body.end_date, 'End date');
  return endDate;
}
export function validateAssignmentListQuery(query, { schedule = false } = {}) {
  const page = query.page === undefined ? 1 : Number(query.page);
  const pageSize = query.pageSize === undefined ? (schedule ? 200 : 20) : Number(query.pageSize);
  const maxSize = schedule ? 500 : 100;
  if (!Number.isSafeInteger(page) || page < 1 || page > 10001 || !Number.isSafeInteger(pageSize) || pageSize < 1 || pageSize > maxSize || (page - 1) * pageSize > 10000) invalid('Pagination is invalid.');
  const result = { page, pageSize };
  for (const [key, label] of [['guardId', 'Guard ID'], ['siteId', 'Site ID'], ['shiftId', 'Shift ID']]) {
    if (query[key] !== undefined) result[key] = id(query[key], label);
  }
  if (query.status !== undefined) {
    if (!['ACTIVE', 'COMPLETED', 'CANCELLED'].includes(query.status)) invalid('Assignment status is invalid.');
    result.status = query.status;
  }
  for (const field of ['from', 'to']) if (query[field] !== undefined) result[field] = date(query[field], field === 'from' ? 'Start date filter' : 'End date filter');
  if (schedule && (!result.from || !result.to)) invalid('Schedule start and end dates are required.');
  if (result.from && result.to) {
    if (result.to < result.from) invalid('End date filter must be on or after start date.');
    if (schedule && result.to - result.from > 30 * 86_400_000) invalid('Schedule range cannot exceed 31 days.');
  }
  return result;
}
