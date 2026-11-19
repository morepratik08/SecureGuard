import { HttpError } from '../utils/http-error.js';
import { normalizeEmail } from '../utils/normalize-email.js';
import { validateAccountCreation } from './account.validator.js';

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const FIELDS = new Set(['name', 'email', 'phone', 'company_name', 'contact_person', 'company_email', 'billing_address', 'gstin']);

function invalid(message = 'Invalid client details.') { throw new HttpError(400, message); }
function text(value, max, label, required = false) {
  if (value === null) return null;
  if (typeof value !== 'string') invalid(`${label} is invalid.`);
  const result = value.trim();
  if (result.length > max || (required && !result)) invalid(`${label} is invalid.`);
  return result || null;
}

export function validateClientCreation(body, actorRole) {
  if (body?.role !== 'CLIENT') throw new HttpError(403, 'Only client accounts can be created here.');
  return validateAccountCreation(body, actorRole);
}

export function validateClientUpdate(body) {
  if (!body || typeof body !== 'object' || Array.isArray(body) || !Object.keys(body).length
    || Object.keys(body).some((key) => !FIELDS.has(key))) invalid();
  const result = {};
  for (const [key, max] of [['name', 100], ['phone', 15], ['company_name', 150], ['contact_person', 100], ['billing_address', 5000], ['gstin', 20]]) {
    if (Object.hasOwn(body, key)) result[key] = text(body[key], max, key, key === 'name' || key === 'company_name');
  }
  if (Object.hasOwn(body, 'email')) {
    const email = typeof body.email === 'string' ? normalizeEmail(body.email) : '';
    if (!email || email.length > 150 || !EMAIL.test(email)) invalid('Email is invalid.');
    result.email = email;
  }
  if (Object.hasOwn(body, 'company_email')) {
    if (body.company_email === null || body.company_email === '') result.company_email = null;
    else {
      const email = typeof body.company_email === 'string' ? normalizeEmail(body.company_email) : '';
      if (email.length > 150 || !EMAIL.test(email)) invalid('Company email is invalid.');
      result.company_email = email;
    }
  }
  return result;
}

export function validateClientListQuery(query) {
  const search = typeof query.search === 'string' ? query.search.trim() : '';
  const status = query.status || undefined;
  if (search.length > 100) invalid('Search must be at most 100 characters.');
  if (status !== undefined && !['ACTIVE', 'INACTIVE'].includes(status)) invalid('Client status filter is invalid.');
  const page = query.page === undefined ? 1 : Number(query.page);
  const pageSize = query.pageSize === undefined ? 20 : Number(query.pageSize);
  if (!Number.isSafeInteger(page) || page < 1 || page > 10001 || !Number.isSafeInteger(pageSize) || pageSize < 1 || pageSize > 100 || (page - 1) * pageSize > 10000) invalid('Pagination is invalid.');
  return { search, status, page, pageSize };
}

export function validateStatus(value) {
  if (!['ACTIVE', 'INACTIVE'].includes(value)) invalid('Client status is invalid.');
  return value;
}
