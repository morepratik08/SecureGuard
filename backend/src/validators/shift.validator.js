import { HttpError } from '../utils/http-error.js';

const FIELDS = new Set(['shift_name', 'start_time', 'end_time', 'description']);
function invalid(message = 'Invalid shift details.') { throw new HttpError(400, message); }
function time(value, label) {
  if (typeof value !== 'string' || !/^(?:[01]\d|2[0-3]):[0-5]\d(?::[0-5]\d)?$/.test(value)) invalid(`${label} must use 24-hour HH:mm or HH:mm:ss format.`);
  return value.length === 5 ? `${value}:00` : value;
}
export function validateShiftInput(body, { partial = false } = {}) {
  if (!body || typeof body !== 'object' || Array.isArray(body) || Object.keys(body).some((key) => !FIELDS.has(key)) || Object.keys(body).length === 0) invalid();
  if (!partial && (!Object.hasOwn(body, 'shift_name') || !Object.hasOwn(body, 'start_time') || !Object.hasOwn(body, 'end_time'))) invalid('Shift name, start time, and end time are required.');
  const result = {};
  if (!partial || Object.hasOwn(body, 'shift_name')) {
    if (typeof body.shift_name !== 'string' || !body.shift_name.trim() || body.shift_name.trim().length > 50) invalid('Shift name is invalid.');
    result.shift_name = body.shift_name.trim();
  }
  for (const field of ['start_time', 'end_time']) if (!partial || Object.hasOwn(body, field)) result[field] = time(body[field], field === 'start_time' ? 'Start time' : 'End time');
  if (result.start_time && result.end_time && result.start_time === result.end_time) invalid('A shift cannot have zero duration.');
  if (Object.hasOwn(body, 'description')) {
    if (body.description !== null && typeof body.description !== 'string') invalid('Description is invalid.');
    if (typeof body.description === 'string' && body.description.length > 5000) invalid('Description is too long.');
    result.description = typeof body.description === 'string' ? body.description.trim() || null : null;
  }
  return result;
}
export function validateShiftStatus(value) {
  if (typeof value !== 'boolean') invalid('is_active must be a boolean.');
  return value;
}
export function validateShiftListQuery(query) {
  const search = typeof query.search === 'string' ? query.search.trim() : '';
  if (search.length > 100) invalid('Search text must be at most 100 characters.');
  let isActive;
  if (query.isActive !== undefined) {
    if (!['true', 'false'].includes(query.isActive)) invalid('isActive must be true or false.');
    isActive = query.isActive === 'true';
  }
  const page = query.page === undefined ? 1 : Number(query.page);
  const pageSize = query.pageSize === undefined ? 20 : Number(query.pageSize);
  if (!Number.isSafeInteger(page) || page < 1 || page > 10001 || !Number.isSafeInteger(pageSize) || pageSize < 1 || pageSize > 100 || (page - 1) * pageSize > 10000) invalid('Pagination is invalid.');
  return { search, isActive, page, pageSize };
}
