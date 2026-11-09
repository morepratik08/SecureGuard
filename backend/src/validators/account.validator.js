import { HttpError } from '../utils/http-error.js';
import { normalizeEmail } from '../utils/normalize-email.js';

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const EMPLOYEE_ROLES = new Set(['SUPERVISOR', 'GUARD']);
const CLIENT_FIELDS = new Set([
  'company_name', 'contact_person', 'company_email', 'phone', 'billing_address', 'gstin',
]);
const SUPERVISOR_FIELDS = new Set(['employee_code', 'joining_date']);
const GUARD_FIELDS = new Set([
  'employee_code', 'joining_date', 'date_of_birth', 'gender', 'address',
  'qualification', 'experience_years', 'emergency_contact', 'base_salary',
]);
const COMMON_FIELDS = new Set(['name', 'email', 'password', 'role', 'phone', 'profile']);

function fail(message = 'Invalid account details.') {
  throw new HttpError(400, message);
}

function assertRecord(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) fail();
}

function assertKeys(value, allowed) {
  if (Object.keys(value).some((key) => !allowed.has(key))) fail();
}

function requiredString(value, maxLength, label) {
  if (typeof value !== 'string') fail(`${label} is required.`);
  const normalized = value.trim();
  if (!normalized || normalized.length > maxLength) fail(`${label} is invalid.`);
  return normalized;
}

function optionalString(value, maxLength, label) {
  if (value === undefined || value === null) return value;
  if (typeof value !== 'string') fail(`${label} is invalid.`);
  const normalized = value.trim();
  if (normalized.length > maxLength) fail(`${label} is invalid.`);
  return normalized || null;
}

function dateField(value, label, required = false) {
  if (value === undefined || value === null || value === '') {
    if (required) fail(`${label} is required.`);
    return value === null ? null : undefined;
  }
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) fail(`${label} must use YYYY-MM-DD.`);
  const date = new Date(`${value}T00:00:00.000Z`);
  if (Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== value) fail(`${label} is invalid.`);
  return date;
}

function decimalField(value, pattern, label, required = false) {
  if (value === undefined || value === null || value === '') {
    if (required) fail(`${label} is required.`);
    return value === null ? null : undefined;
  }
  if (typeof value !== 'number' && typeof value !== 'string') fail(`${label} is invalid.`);
  const normalized = String(value);
  if (!pattern.test(normalized)) fail(`${label} is invalid.`);
  return normalized;
}

function validateProfile(role, input) {
  assertRecord(input);
  const profile = {};

  if (role === 'ADMIN') {
    assertKeys(input, new Set());
    return profile;
  }
  if (role === 'SUPERVISOR') {
    assertKeys(input, SUPERVISOR_FIELDS);
    profile.employee_code = requiredString(input.employee_code, 30, 'employee_code').toUpperCase();
    profile.joining_date = dateField(input.joining_date, 'joining_date', true);
    return profile;
  }
  if (role === 'GUARD') {
    assertKeys(input, GUARD_FIELDS);
    profile.employee_code = requiredString(input.employee_code, 30, 'employee_code').toUpperCase();
    profile.joining_date = dateField(input.joining_date, 'joining_date', true);
    profile.base_salary = decimalField(input.base_salary, /^(?:0|[1-9]\d{0,9})(?:\.\d{1,2})?$/, 'base_salary', true);

    const dateOfBirth = dateField(input.date_of_birth, 'date_of_birth');
    if (dateOfBirth !== undefined) profile.date_of_birth = dateOfBirth;
    for (const [key, max, label] of [
      ['gender', 20, 'gender'], ['address', 5000, 'address'],
      ['qualification', 150, 'qualification'], ['emergency_contact', 15, 'emergency_contact'],
    ]) {
      const value = optionalString(input[key], max, label);
      if (value !== undefined) profile[key] = value;
    }
    const experience = decimalField(input.experience_years, /^(?:0|[1-9]\d{0,2})(?:\.\d)?$/, 'experience_years');
    if (experience !== undefined) profile.experience_years = experience;
    return profile;
  }
  if (role === 'CLIENT') {
    assertKeys(input, CLIENT_FIELDS);
    profile.company_name = requiredString(input.company_name, 150, 'company_name');
    for (const [key, max, label] of [
      ['contact_person', 100, 'contact_person'], ['phone', 15, 'phone'],
      ['billing_address', 5000, 'billing_address'], ['gstin', 20, 'gstin'],
    ]) {
      const value = optionalString(input[key], max, label);
      if (value !== undefined) profile[key] = value;
    }
    const companyEmail = optionalString(input.company_email, 150, 'company_email');
    if (companyEmail !== undefined && companyEmail !== null) {
      const normalizedEmail = normalizeEmail(companyEmail);
      if (!EMAIL_PATTERN.test(normalizedEmail)) fail('company_email is invalid.');
      profile.company_email = normalizedEmail;
    } else if (companyEmail === null) {
      profile.company_email = null;
    }
    return profile;
  }

  throw new HttpError(403, 'You are not authorized to create this account role.');
}

export function validateAccountCreation(body, creatorRole) {
  assertRecord(body);
  assertKeys(body, COMMON_FIELDS);

  const allowedRoles = creatorRole === 'SUPER_ADMIN'
    ? new Set(['ADMIN', 'SUPERVISOR', 'GUARD', 'CLIENT'])
    : creatorRole === 'ADMIN'
      ? new Set(['SUPERVISOR', 'GUARD', 'CLIENT'])
      : new Set();
  if (!allowedRoles.has(body.role)) {
    throw new HttpError(403, 'You are not authorized to create this account role.');
  }

  const name = requiredString(body.name, 100, 'name');
  const email = typeof body.email === 'string' ? normalizeEmail(body.email) : '';
  if (!email || email.length > 150 || !EMAIL_PATTERN.test(email)) fail('email is invalid.');

  const password = validateNewPassword(body.password);
  const phone = optionalString(body.phone, 15, 'phone');
  const profile = validateProfile(body.role, body.profile);

  return {
    name,
    email,
    password,
    role: body.role,
    ...(phone === undefined ? {} : { phone }),
    profile,
  };
}

export function validatePasswordChange(body) {
  assertRecord(body);
  assertKeys(body, new Set(['currentPassword', 'newPassword']));
  if (typeof body.currentPassword !== 'string'
    || !body.currentPassword
    || Buffer.byteLength(body.currentPassword, 'utf8') > 72) {
    fail('Current password is required.');
  }
  return { currentPassword: body.currentPassword, newPassword: validateNewPassword(body.newPassword) };
}

export function validatePasswordReset(body) {
  assertRecord(body);
  assertKeys(body, new Set(['newPassword']));
  return { newPassword: validateNewPassword(body.newPassword) };
}

export function validateNewPassword(value) {
  if (typeof value !== 'string'
    || Array.from(value).length < 12
    || Buffer.byteLength(value, 'utf8') > 72) {
    fail('Password must be at least 12 characters and no more than 72 UTF-8 bytes.');
  }
  return value;
}

export function parseAccountId(value) {
  if (typeof value !== 'string' || !/^[1-9]\d{0,19}$/.test(value)) return null;
  try {
    const id = BigInt(value);
    return id <= 18_446_744_073_709_551_615n ? id : null;
  } catch {
    return null;
  }
}
