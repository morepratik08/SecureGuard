import { HttpError } from '../utils/http-error.js';
import { normalizeEmail } from '../utils/normalize-email.js';
import { validateAccountCreation } from './account.validator.js';

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const EMPLOYEE_ROLES = new Set(['GUARD', 'SUPERVISOR']);
const GUARD_STATUSES = new Set(['ACTIVE', 'INACTIVE', 'ON_LEAVE', 'TERMINATED']);
const SUPERVISOR_STATUSES = new Set(['ACTIVE', 'INACTIVE']);
const UPDATE_FIELDS = new Set([
  'name', 'email', 'phone', 'employee_code', 'joining_date', 'date_of_birth',
  'gender', 'address', 'qualification', 'experience_years', 'emergency_contact', 'base_salary',
]);

function invalid(message = 'Invalid employee details.') {
  throw new HttpError(400, message);
}

function assertObject(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) invalid();
}

function optionalText(value, maxLength, label) {
  if (value === null) return null;
  if (typeof value !== 'string') invalid(`${label} is invalid.`);
  const normalized = value.trim();
  if (normalized.length > maxLength) invalid(`${label} is invalid.`);
  return normalized || null;
}

function dateValue(value, label) {
  if (value === null) return null;
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    invalid(`${label} must use YYYY-MM-DD.`);
  }
  const date = new Date(`${value}T00:00:00.000Z`);
  if (Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== value) {
    invalid(`${label} is invalid.`);
  }
  return date;
}

function decimalValue(value, pattern, label) {
  if (typeof value !== 'number' && typeof value !== 'string') invalid(`${label} is invalid.`);
  const normalized = String(value);
  if (!pattern.test(normalized)) invalid(`${label} is invalid.`);
  return normalized;
}

export function validateEmployeeCreation(body, actorRole) {
  if (!EMPLOYEE_ROLES.has(body?.role)) {
    throw new HttpError(403, 'Only guard and supervisor accounts can be created in employee management.');
  }
  return validateAccountCreation(body, actorRole);
}

export function validateEmployeeListQuery(query, actorRole) {
  const search = typeof query.search === 'string' ? query.search.trim() : '';
  if (search.length > 100) invalid('Search text must be at most 100 characters.');

  const role = query.role || undefined;
  if (role !== undefined && !EMPLOYEE_ROLES.has(role)) invalid('Role filter is invalid.');
  if (actorRole === 'SUPERVISOR' && role === 'SUPERVISOR') {
    throw new HttpError(403, 'Supervisors may only view guards in their assigned scope.');
  }

  const status = query.status || undefined;
  if (status !== undefined && !new Set([...GUARD_STATUSES, ...SUPERVISOR_STATUSES]).has(status)) {
    invalid('Employment status filter is invalid.');
  }

  const page = query.page === undefined ? 1 : Number(query.page);
  const pageSize = query.pageSize === undefined ? 20 : Number(query.pageSize);
  if (!Number.isSafeInteger(page) || page < 1 || page > 10001) invalid('Page must be between 1 and 10001.');
  if (!Number.isSafeInteger(pageSize) || pageSize < 1 || pageSize > 100) invalid('Page size must be between 1 and 100.');
  if ((page - 1) * pageSize > 10000) invalid('Requested page is too deep.');

  const sortBy = query.sortBy || 'name';
  if (!new Set(['name', 'employeeCode', 'role', 'status', 'joiningDate']).has(sortBy)) {
    invalid('Sort field is invalid.');
  }
  const sortOrder = query.sortOrder || 'asc';
  if (!['asc', 'desc'].includes(sortOrder)) invalid('Sort order is invalid.');

  return { search, role, status, page, pageSize, sortBy, sortOrder };
}

export function validateEmployeeUpdate(body, role) {
  assertObject(body);
  const keys = Object.keys(body);
  if (keys.length === 0 || keys.some((key) => !UPDATE_FIELDS.has(key))) invalid();
  if (!EMPLOYEE_ROLES.has(role)) throw new HttpError(404, 'Employee not found.');

  const result = {};
  if (Object.hasOwn(body, 'name')) {
    const name = optionalText(body.name, 100, 'Name');
    if (!name) invalid('Name cannot be empty.');
    result.name = name;
  }
  if (Object.hasOwn(body, 'email')) {
    if (typeof body.email !== 'string') invalid('Email is invalid.');
    const email = normalizeEmail(body.email);
    if (!email || email.length > 150 || !EMAIL_PATTERN.test(email)) invalid('Email is invalid.');
    result.email = email;
  }
  if (Object.hasOwn(body, 'phone')) result.phone = optionalText(body.phone, 15, 'Phone');
  if (Object.hasOwn(body, 'employee_code')) {
    const code = optionalText(body.employee_code, 30, 'Employee code');
    if (!code) invalid('Employee code cannot be empty.');
    result.employee_code = code.toUpperCase();
  }
  if (Object.hasOwn(body, 'joining_date')) result.joining_date = dateValue(body.joining_date, 'Joining date');

  if (role === 'GUARD') {
    if (Object.hasOwn(body, 'date_of_birth')) result.date_of_birth = dateValue(body.date_of_birth, 'Date of birth');
    for (const [field, max, label] of [
      ['gender', 20, 'Gender'], ['address', 5000, 'Address'],
      ['qualification', 150, 'Qualification'], ['emergency_contact', 15, 'Emergency contact'],
    ]) {
      if (Object.hasOwn(body, field)) result[field] = optionalText(body[field], max, label);
    }
    if (Object.hasOwn(body, 'experience_years')) {
      result.experience_years = body.experience_years === null
        ? null
        : decimalValue(body.experience_years, /^(?:0|[1-9]\d{0,2})(?:\.\d)?$/, 'Experience');
    }
    if (Object.hasOwn(body, 'base_salary')) {
      result.base_salary = decimalValue(body.base_salary, /^(?:0|[1-9]\d{0,9})(?:\.\d{1,2})?$/, 'Base salary');
    }
  } else if (['date_of_birth', 'gender', 'address', 'qualification', 'experience_years', 'emergency_contact', 'base_salary'].some((field) => Object.hasOwn(body, field))) {
    invalid('One or more fields are not supported for this employee role.');
  }

  return result;
}

export function validateEmployeeStatus(role, value) {
  const allowed = role === 'GUARD' ? GUARD_STATUSES : role === 'SUPERVISOR' ? SUPERVISOR_STATUSES : null;
  if (!allowed) throw new HttpError(404, 'Employee not found.');
  if (typeof value !== 'string' || !allowed.has(value)) invalid('Employment status is invalid for this employee role.');
  return value;
}
