import { HttpError } from '../utils/http-error.js';
import { parseAccountId } from './account.validator.js';

const STATUSES = new Set(['OPEN', 'INVESTIGATING', 'RESOLVED', 'CLOSED']);
const SEVERITIES = new Set(['LOW', 'MEDIUM', 'HIGH', 'CRITICAL']);
const CREATE_FIELDS = new Set(['site_id', 'incident_title', 'description', 'severity', 'incident_time']);
const UPDATE_FIELDS = new Set(['incident_title', 'description', 'severity', 'incident_time']);

function invalid(message = 'Invalid incident details.') { throw new HttpError(400, message); }
function object(value) { if (!value || typeof value !== 'object' || Array.isArray(value)) invalid(); }
function keys(value, permitted) { if (Object.keys(value).some((key) => !permitted.has(key))) invalid('Unsupported incident fields were supplied.'); }
function id(value, label) {
  const parsed = parseAccountId(String(value ?? ''));
  if (!parsed) invalid(`${label} is invalid.`);
  return parsed;
}
function text(value, max, label) {
  if (typeof value !== 'string' || !value.trim() || value.trim().length > max) invalid(`${label} is invalid.`);
  return value.trim();
}
function incidentDate(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2})?(\.\d{1,3})?(Z|[+-]\d{2}:\d{2})$/.test(value)) invalid('incident_time must be an ISO date-time with a timezone.');
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) invalid('incident_time is invalid.');
  return date;
}
function optionalFields(body, partial) {
  const value = {};
  if (!partial || Object.hasOwn(body, 'incident_title')) value.incident_title = text(body.incident_title, 150, 'Incident title');
  if (!partial || Object.hasOwn(body, 'description')) value.description = text(body.description, 20000, 'Description');
  if (Object.hasOwn(body, 'severity')) {
    if (!SEVERITIES.has(body.severity)) invalid('Incident severity is invalid.');
    value.severity = body.severity;
  }
  if (!partial && !Object.hasOwn(body, 'severity')) value.severity = 'LOW';
  if (Object.hasOwn(body, 'incident_time')) value.incident_time = incidentDate(body.incident_time);
  if (!partial && !Object.hasOwn(body, 'incident_time')) invalid('Incident time is required.');
  if (!Object.keys(value).length) invalid('At least one incident field is required.');
  return value;
}

export function validateIncidentCreate(body) {
  object(body); keys(body, CREATE_FIELDS);
  return { site_id: id(body.site_id, 'Site ID'), ...optionalFields(body, false) };
}

export function validateIncidentUpdate(body) {
  object(body); keys(body, UPDATE_FIELDS);
  return optionalFields(body, true);
}

export function validateIncidentStatus(body) {
  object(body); keys(body, new Set(['status']));
  if (!STATUSES.has(body.status)) invalid('Incident status is invalid.');
  return body.status;
}

export function validateIncidentListQuery(query) {
  const search = typeof query.search === 'string' ? query.search.trim() : '';
  if (search.length > 100) invalid('Search must be at most 100 characters.');
  const siteId = query.siteId === undefined ? undefined : id(query.siteId, 'Site ID');
  const status = query.status || undefined;
  const severity = query.severity || undefined;
  if (status && !STATUSES.has(status)) invalid('Incident status filter is invalid.');
  if (severity && !SEVERITIES.has(severity)) invalid('Incident severity filter is invalid.');
  const date = (value, label) => {
    if (value === undefined) return undefined;
    if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) invalid(`${label} must use YYYY-MM-DD.`);
    const parsed = new Date(`${value}T00:00:00.000Z`);
    if (Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== value) invalid(`${label} is invalid.`);
    return parsed;
  };
  const from = date(query.from, 'Start date');
  const to = date(query.to, 'End date');
  if (from && to && from > to) invalid('Start date must be on or before end date.');
  const page = query.page === undefined ? 1 : Number(query.page);
  const pageSize = query.pageSize === undefined ? 20 : Number(query.pageSize);
  if (!Number.isSafeInteger(page) || page < 1 || page > 10001 || !Number.isSafeInteger(pageSize) || pageSize < 1 || pageSize > 100 || (page - 1) * pageSize > 10000) invalid('Pagination is invalid.');
  return { search, siteId, status, severity, from, to, page, pageSize };
}
