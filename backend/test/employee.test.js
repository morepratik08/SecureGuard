import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import { randomBytes } from 'node:crypto';
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import prisma from '../src/config/prisma.js';
import app from '../src/app.js';

const originals = {
  queryRaw: prisma.$queryRaw,
  transaction: prisma.$transaction,
  usersFindUnique: prisma.users.findUnique,
  guards: { ...prisma.guards },
  supervisors: { ...prisma.supervisors },
};

let server;
let state;
let sharedPasswordHash;

const updatedAt = new Date('2026-08-01T00:00:00.000Z');

function user(id, name, role, { isActive = true, email, guards = null, supervisors = null, clients = null } = {}) {
  return {
    id: BigInt(id),
    name,
    email: email || `${String(id).replaceAll('-', '')}@example.test`,
    password_hash: sharedPasswordHash,
    phone: null,
    role,
    is_active: isActive,
    created_at: updatedAt,
    updated_at: updatedAt,
    guards,
    supervisors,
    clients,
  };
}

function setupState() {
  const guards = [
    { id: 301n, user_id: 3n, employee_code: 'G-100', joining_date: new Date('2024-01-10Z'), employment_status: 'ACTIVE', date_of_birth: new Date('1990-02-03Z'), gender: 'Female', address: 'Private address', qualification: 'Diploma', experience_years: '4.5', emergency_contact: '1111111111', base_salary: '28000.00', created_at: updatedAt },
    { id: 302n, user_id: 4n, employee_code: 'G-200', joining_date: new Date('2024-02-10Z'), employment_status: 'ACTIVE', date_of_birth: null, gender: null, address: null, qualification: null, experience_years: '0.0', emergency_contact: null, base_salary: '26000.00', created_at: updatedAt },
    { id: 303n, user_id: 7n, employee_code: 'G-300', joining_date: new Date('2024-03-10Z'), employment_status: 'ON_LEAVE', date_of_birth: null, gender: null, address: null, qualification: null, experience_years: '2.0', emergency_contact: null, base_salary: '25000.00', created_at: updatedAt },
    { id: 304n, user_id: 8n, employee_code: 'G-400', joining_date: new Date('2024-04-10Z'), employment_status: 'INACTIVE', date_of_birth: null, gender: null, address: null, qualification: null, experience_years: '1.0', emergency_contact: null, base_salary: '24000.00', created_at: updatedAt },
    { id: 305n, user_id: 9n, employee_code: 'G-500', joining_date: new Date('2024-05-10Z'), employment_status: 'TERMINATED', date_of_birth: null, gender: null, address: null, qualification: null, experience_years: '1.0', emergency_contact: null, base_salary: '23000.00', created_at: updatedAt },
    { id: 306n, user_id: 9007199254740993n, employee_code: 'G-600', joining_date: new Date('2024-06-10Z'), employment_status: 'ACTIVE', date_of_birth: null, gender: null, address: null, qualification: null, experience_years: '0.0', emergency_contact: null, base_salary: '27000.00', created_at: updatedAt },
  ];
  const supervisors = [
    { id: 200n, user_id: 2n, employee_code: 'S-100', joining_date: new Date('2023-01-01Z'), status: 'ACTIVE' },
    { id: 201n, user_id: 5n, employee_code: 'S-200', joining_date: new Date('2023-02-01Z'), status: 'ACTIVE' },
  ];
  const users = [
    user(1n, 'Secure Admin', 'ADMIN'),
    user(2n, 'Site Supervisor', 'SUPERVISOR', { supervisors: { status: 'ACTIVE' } }),
    user(3n, 'Asha Guard', 'GUARD', { guards: { employment_status: 'ACTIVE' } }),
    user(4n, 'Bala Guard', 'GUARD', { guards: { employment_status: 'ACTIVE' } }),
    user(5n, 'Other Supervisor', 'SUPERVISOR', { supervisors: { status: 'ACTIVE' } }),
    user(6n, 'Client User', 'CLIENT', { clients: { status: 'ACTIVE' } }),
    user(7n, 'Chetan Leave', 'GUARD', { guards: { employment_status: 'ON_LEAVE' } }),
    user(8n, 'Deepa Inactive', 'GUARD', { isActive: false, guards: { employment_status: 'INACTIVE' } }),
    user(9n, 'Esha Terminated', 'GUARD', { isActive: false, guards: { employment_status: 'TERMINATED' } }),
    user(9007199254740993n, 'Farah Large ID', 'GUARD', { guards: { employment_status: 'ACTIVE' } }),
  ];
  const result = {
    users,
    guards,
    supervisors,
    assignments: [
      { guard_id: 301n, site_id: 501n }, { guard_id: 303n, site_id: 501n },
      { guard_id: 304n, site_id: 501n }, { guard_id: 305n, site_id: 501n },
      { guard_id: 306n, site_id: 501n }, { guard_id: 302n, site_id: 502n },
    ],
    sites: [{ id: 501n, supervisor_id: 200n }, { id: 502n, supervisor_id: 201n }],
    audit_logs: [],
    historicalRows: [{ guard_id: 301n, kind: 'attendance' }, { guard_id: 301n, kind: 'salary' }, { guard_id: 301n, kind: 'assignment' }],
  };
  for (const entry of result.users) {
    if (entry.role === 'GUARD') entry.guards = result.guards.find((profile) => profile.user_id === entry.id) ?? null;
    if (entry.role === 'SUPERVISOR') entry.supervisors = result.supervisors.find((profile) => profile.user_id === entry.id) ?? null;
  }
  return result;
}

function cloneState(value) {
  if (value instanceof Date) return new Date(value);
  if (Array.isArray(value)) return value.map(cloneState);
  if (value && typeof value === 'object' && Object.getPrototypeOf(value) === Object.prototype) {
    return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, cloneState(item)]));
  }
  return value;
}

function project(value, select) {
  if (value === null || value === undefined) return null;
  if (!select) return value;
  const result = {};
  for (const [field, selection] of Object.entries(select)) {
    if (selection === true) result[field] = value[field];
    else if (selection?.select) {
      const relation = field === 'guards' && value.role === 'GUARD'
        ? profileForUser('GUARD', value.id)
        : field === 'supervisors' && value.role === 'SUPERVISOR'
          ? profileForUser('SUPERVISOR', value.id)
          : value[field];
      result[field] = project(relation, selection.select);
    }
  }
  return result;
}

function userFor(where) {
  return state.users.find((entry) => (where.id !== undefined && entry.id === where.id)
    || (where.email !== undefined && entry.email === where.email)) ?? null;
}

function profileForUser(role, userId) {
  const source = role === 'GUARD' ? state.guards : state.supervisors;
  return source.find((entry) => entry.user_id === userId) ?? null;
}

function relationUser(profile) {
  return state.users.find((entry) => entry.id === profile.user_id) ?? null;
}

function matchCondition(record, condition) {
  if (!condition || Object.keys(condition).length === 0) return true;
  if (condition.AND && !condition.AND.every((part) => matchCondition(record, part))) return false;
  if (condition.OR && !condition.OR.some((part) => matchCondition(record, part))) return false;
  for (const [field, expected] of Object.entries(condition)) {
    if (field === 'AND' || field === 'OR') continue;
    if (field === 'users') {
      const nested = expected.is ?? expected;
      if (!matchCondition(relationUser(record), nested)) return false;
      continue;
    }
    if (field === 'assignments') {
      const nested = expected.some;
      const valid = state.assignments.some((assignment) => assignment.guard_id === record.id
        && matchCondition(state.sites.find((site) => site.id === assignment.site_id), nested.sites.is));
      if (!valid) return false;
      continue;
    }
    const value = record?.[field];
    if (expected && typeof expected === 'object' && !(expected instanceof Date)) {
      if (Object.hasOwn(expected, 'contains') && !String(value ?? '').toLowerCase().includes(expected.contains.toLowerCase())) return false;
      if (Object.hasOwn(expected, 'in') && !expected.in.includes(value)) return false;
      if (Object.hasOwn(expected, 'not') && value === expected.not) return false;
    } else if (value !== expected) return false;
  }
  return true;
}

function delegateFor(role) {
  const records = () => role === 'GUARD' ? state.guards : state.supervisors;
  const withUser = (record) => ({ ...record, users: relationUser(record) });
  return {
    findMany: async ({ where = {}, take = Number.MAX_SAFE_INTEGER } = {}) => records().filter((record) => matchCondition(withUser(record), where)).slice(0, take).map(withUser),
    findFirst: async ({ where = {} } = {}) => records().filter((record) => matchCondition(withUser(record), where)).slice(0, 1).map(withUser)[0] ?? null,
    count: async ({ where = {} } = {}) => records().filter((record) => matchCondition(withUser(record), where)).length,
    findUnique: async ({ where }) => {
      const record = records().find((entry) => (where.user_id !== undefined && entry.user_id === where.user_id)
        || (where.id !== undefined && entry.id === where.id));
      return record ?? null;
    },
    create: async ({ data }) => {
      const source = records();
      const duplicate = source.some((entry) => entry.employee_code === data.employee_code || entry.user_id === data.user_id);
      if (duplicate) { const error = new Error('unique'); error.code = 'P2002'; throw error; }
      const record = { id: BigInt(1000 + source.length), ...data, created_at: updatedAt };
      source.push(record);
      if (role === 'GUARD') {
        const u = userFor({ id: data.user_id });
        if (u) u.guards = record;
      } else {
        const u = userFor({ id: data.user_id });
        if (u) u.supervisors = record;
      }
      return record;
    },
    update: async ({ where, data }) => {
      const record = records().find((entry) => (where.user_id !== undefined && entry.user_id === where.user_id)
        || (where.id !== undefined && entry.id === where.id));
      if (!record) throw new Error('missing profile');
      Object.assign(record, data);
      const u = userFor({ id: record.user_id });
      if (u && role === 'GUARD' && Object.hasOwn(data, 'employment_status')) u.guards.employment_status = data.employment_status;
      if (u && role === 'SUPERVISOR' && Object.hasOwn(data, 'status')) u.supervisors.status = data.status;
      return record;
    },
  };
}

function queryRaw(strings, ...values) {
  const sql = Array.from(strings).join('?');
  if (sql.includes('GET_LOCK')) return [{ acquired: 1 }];
  if (sql.includes('RELEASE_LOCK')) return [{ released: 1 }];
  if (sql.includes('LOWER(TRIM(email))')) {
    return state.users.filter((entry) => entry.email.trim().toLowerCase() === values[0].toLowerCase()
      && (values.length < 2 || entry.id !== values[1])).slice(0, 1).map(({ id }) => ({ id }));
  }
  if (sql.includes('UPPER(TRIM(employee_code))')) {
    const source = sql.includes('FROM guards') ? state.guards : state.supervisors;
    return source.filter((entry) => entry.employee_code.trim().toUpperCase() === values[0].toUpperCase()
      && (values.length < 2 || entry.user_id !== values.at(-1))).slice(0, 1).map(({ id }) => ({ id }));
  }
  return [];
}

function txClient() {
  return {
    $queryRaw: async (strings, ...values) => queryRaw(strings, ...values),
    users: {
      findUnique: async ({ where, select }) => project(userFor(where), select),
      create: async ({ data, select }) => {
        if (state.users.some((entry) => entry.email === data.email)) { const error = new Error('unique'); error.code = 'P2002'; throw error; }
        const created = { id: BigInt(Math.max(...state.users.map((entry) => Number(entry.id))) + 1), ...data, created_at: updatedAt, updated_at: updatedAt, guards: null, supervisors: null };
        state.users.push(created);
        return project(created, select);
      },
      update: async ({ where, data }) => {
        const current = userFor(where);
        if (!current) throw new Error('missing user');
        Object.assign(current, data);
        return current;
      },
    },
    guards: { ...delegateFor('GUARD') },
    supervisors: { ...delegateFor('SUPERVISOR') },
    audit_logs: {
      create: async ({ data }) => {
        const record = { id: BigInt(state.audit_logs.length + 1), ...data };
        state.audit_logs.push(record);
        return record;
      },
    },
    clients: { create: async ({ data }) => data },
  };
}

function signToken(id, role) {
  const current = userFor({ id: BigInt(id) });
  return jwt.sign({
    sub: String(id),
    role,
    av: String(current.updated_at.getTime()),
  }, process.env.JWT_SECRET, {
    algorithm: 'HS256', issuer: 'secureguard-api', audience: 'secureguard-client', expiresIn: 3600,
  });
}

async function request(method, path, { id = '1', role = 'ADMIN', token = signToken(id, role), body } = {}) {
  const response = await fetch(`http://127.0.0.1:${server.address().port}${path}`, {
    method,
    headers: { authorization: `Bearer ${token}`, ...(body === undefined ? {} : { 'content-type': 'application/json' }) },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  return { response, body: await response.json() };
}

function guardBody({ email = 'new.guard@example.test', code = 'G-NEW', name = 'New Guard' } = {}) {
  return {
    name, email, phone: '5551234567', password: 'Long-Enough-Password', role: 'GUARD',
    profile: { employee_code: code, joining_date: '2025-01-20', base_salary: '30000.00', experience_years: '2.5' },
  };
}

before(async () => {
  process.env.JWT_SECRET = randomBytes(48).toString('base64url');
  process.env.JWT_EXPIRES_IN = '1h';
  sharedPasswordHash = await bcrypt.hash('GoodTestPassword!234', 4);
  state = setupState();

  prisma.users.findUnique = async ({ where, select }) => project(userFor(where), select);
  prisma.$queryRaw = async (strings, ...values) => queryRaw(strings, ...values);
  prisma.guards.findMany = delegateFor('GUARD').findMany;
  prisma.guards.findFirst = delegateFor('GUARD').findFirst;
  prisma.guards.count = delegateFor('GUARD').count;
  prisma.guards.findUnique = delegateFor('GUARD').findUnique;
  prisma.supervisors.findMany = delegateFor('SUPERVISOR').findMany;
  prisma.supervisors.count = delegateFor('SUPERVISOR').count;
  prisma.supervisors.findUnique = delegateFor('SUPERVISOR').findUnique;
  prisma.$transaction = async (callback) => {
    const snapshot = cloneState(state);
    try { return await callback(txClient()); }
    catch (error) { state = snapshot; throw error; }
  };
  server = app.listen(0, '127.0.0.1');
  await new Promise((resolve) => server.once('listening', resolve));
});

after(async () => {
  if (server?.listening) await new Promise((resolve) => server.close(resolve));
  prisma.$queryRaw = originals.queryRaw;
  prisma.$transaction = originals.transaction;
  prisma.users.findUnique = originals.usersFindUnique;
  for (const [key, value] of Object.entries(originals.guards)) prisma.guards[key] = value;
  for (const [key, value] of Object.entries(originals.supervisors)) prisma.supervisors[key] = value;
});

test('employee listing supports scoped pagination, search, filters, sorting and summary counts', { concurrency: false }, async () => {
  const listing = await request('GET', '/api/employees?role=GUARD&search=G-&sortBy=employeeCode&sortOrder=asc&page=2&pageSize=2');
  assert.equal(listing.response.status, 200);
  assert.equal(listing.body.pagination.total, 6);
  assert.equal(listing.body.pagination.page, 2);
  assert.deepEqual(listing.body.employees.map((entry) => entry.employee_code), ['G-300', 'G-400']);

  const filtered = await request('GET', '/api/employees?status=ON_LEAVE');
  assert.equal(filtered.body.pagination.total, 1);
  assert.equal(filtered.body.employees[0].employee_code, 'G-300');

  const summary = await request('GET', '/api/employees/summary');
  assert.equal(summary.response.status, 200);
  assert.deepEqual(summary.body.summary, {
    totalGuards: 6, totalSupervisors: 2, activeEmployees: 5, inactiveEmployees: 2, employeesOnLeave: 1,
  });

  const scoped = await request('GET', '/api/employees', { id: '2', role: 'SUPERVISOR' });
  assert.equal(scoped.response.status, 200);
  assert.equal(scoped.body.pagination.total, 5);
  assert.equal(scoped.body.employees.some((entry) => entry.employee_code === 'G-200'), false);
});

test('employee detail enforces role scope and serializes large BigInt identifiers safely', { concurrency: false }, async () => {
  const ownGuard = await request('GET', '/api/employees/9007199254740993', { id: '9007199254740993', role: 'GUARD' });
  assert.equal(ownGuard.response.status, 200);
  assert.equal(ownGuard.body.employee.id, '9007199254740993');
  assert.equal(Object.hasOwn(ownGuard.body.employee, 'base_salary'), false);
  assert.equal(JSON.stringify(ownGuard.body).includes('password_hash'), false);

  const guardIdor = await request('GET', '/api/employees/3', { id: '4', role: 'GUARD' });
  assert.equal(guardIdor.response.status, 404);

  const supervisorScoped = await request('GET', '/api/employees/3', { id: '2', role: 'SUPERVISOR' });
  assert.equal(supervisorScoped.response.status, 200);
  assert.equal(Object.hasOwn(supervisorScoped.body.employee, 'base_salary'), false);
  assert.equal(Object.hasOwn(supervisorScoped.body.employee, 'date_of_birth'), false);

  const supervisorIdor = await request('GET', '/api/employees/4', { id: '2', role: 'SUPERVISOR' });
  assert.equal(supervisorIdor.response.status, 404);

  const adminDetails = await request('GET', '/api/employees/3');
  assert.equal(adminDetails.response.status, 200);
  assert.equal(adminDetails.body.employee.base_salary, '28000.00');
  assert.equal(typeof adminDetails.body.employee.id, 'string');
});

test('employee creation, edits, status transitions, audit and historical records remain safe', { concurrency: false }, async () => {
  const created = await request('POST', '/api/employees', { body: guardBody() });
  assert.equal(created.response.status, 201);
  assert.equal(created.body.employee.role, 'GUARD');
  assert.equal(Object.hasOwn(created.body.employee, 'password_hash'), false);
  const createdUser = state.users.find((entry) => entry.email === 'new.guard@example.test');
  assert.equal(await bcrypt.compare('Long-Enough-Password', createdUser.password_hash), true);
  assert.equal(state.audit_logs.at(-1).action, 'EMPLOYEE_CREATED');

  const duplicateEmail = await request('POST', '/api/employees', { body: guardBody({ email: ' ASHA@EXAMPLE.TEST ', code: 'G-NEW2' }) });
  assert.equal(duplicateEmail.response.status, 409);
  const duplicateCrossRoleCode = await request('POST', '/api/employees', { body: { name: 'Duplicate Supervisor', email: 'duplicate.super@example.test', password: 'Long-Enough-Password', role: 'SUPERVISOR', profile: { employee_code: 'G-100', joining_date: '2025-01-20' } } });
  assert.equal(duplicateCrossRoleCode.response.status, 409);
  const invalidInput = await request('POST', '/api/employees', { body: { ...guardBody({ email: 'bad', code: 'bad' }), profile: { employee_code: 'bad', joining_date: '2025-02-30', base_salary: '1' } } });
  assert.equal(invalidInput.response.status, 400);
  const noPrivilegedRole = await request('POST', '/api/employees', { body: { name: 'Escalation', email: 'admin2@example.test', password: 'Long-Enough-Password', role: 'ADMIN', profile: {} } });
  assert.equal(noPrivilegedRole.response.status, 403);
  const clientCannotCreate = await request('POST', '/api/employees', { id: '6', role: 'CLIENT', body: guardBody({ email: 'client-create@example.test' }) });
  assert.equal(clientCannotCreate.response.status, 403);
  const guardCannotEdit = await request('PATCH', '/api/employees/3', { id: '3', role: 'GUARD', body: { name: 'No Permission' } });
  assert.equal(guardCannotEdit.response.status, 403);

  const employeeId = created.body.employee.id;
  const updated = await request('PATCH', `/api/employees/${employeeId}`, { body: { name: 'Updated Guard', email: 'updated.guard@example.test', base_salary: '31500.00' } });
  assert.equal(updated.response.status, 200);
  assert.equal(updated.body.employee.name, 'Updated Guard');
  assert.equal(updated.body.employee.base_salary, '31500.00');
  assert.equal(state.audit_logs.at(-1).action, 'EMPLOYEE_PROFILE_UPDATED');

  const onLeave = await request('PATCH', `/api/employees/${employeeId}/status`, { body: { status: 'ON_LEAVE' } });
  assert.equal(onLeave.response.status, 200);
  assert.equal(onLeave.body.employee.employment_status, 'ON_LEAVE');
  assert.equal(state.users.find((entry) => entry.id.toString() === employeeId).is_active, true);
  assert.equal(state.audit_logs.at(-1).action, 'EMPLOYEE_STATUS_CHANGED');

  const inactive = await request('PATCH', `/api/employees/${employeeId}/status`, { body: { status: 'INACTIVE' } });
  assert.equal(inactive.response.status, 200);
  assert.equal(state.users.find((entry) => entry.id.toString() === employeeId).is_active, false);
  assert.equal((await request('GET', '/api/employees/me', { id: employeeId, role: 'GUARD' })).response.status, 401);

  const deletes = await request('DELETE', `/api/employees/${employeeId}`);
  assert.equal(deletes.response.status, 404);
  assert.equal(state.users.some((entry) => entry.id.toString() === employeeId), true);
  assert.equal(state.historicalRows.length, 3);
});
