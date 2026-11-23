import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import { randomBytes } from 'node:crypto';
import jwt from 'jsonwebtoken';
import prisma from '../src/config/prisma.js';
import app from '../src/app.js';

const original = {
  transaction: prisma.$transaction, query: prisma.$queryRaw,
  users: { ...prisma.users }, guards: { ...prisma.guards }, supervisors: { ...prisma.supervisors },
  sites: { ...prisma.sites }, shifts: { ...prisma.shifts }, assignments: { ...prisma.assignments },
};
const today = new Date().toISOString().slice(0, 10);
const todayDate = new Date(`${today}T00:00:00.000Z`);
const ts = new Date(`${today}T00:00:00.000Z`);
let state; let server;

function time(value) { return new Date(`1970-01-01T${value}Z`); }
function seed() {
  return {
    users: [
      { id: 1n, name: 'Admin User', email: 'admin@example.test', role: 'ADMIN', is_active: true, created_at: ts, updated_at: ts },
      { id: 2n, name: 'Supervisor One', email: 'supervisor@example.test', role: 'SUPERVISOR', is_active: true, created_at: ts, updated_at: ts },
      { id: 3n, name: 'Active Guard', email: 'guard@example.test', role: 'GUARD', is_active: true, created_at: ts, updated_at: ts },
      { id: 4n, name: 'Leave Guard', email: 'leave@example.test', role: 'GUARD', is_active: true, created_at: ts, updated_at: ts },
      { id: 5n, name: 'Inactive Guard', email: 'inactive@example.test', role: 'GUARD', is_active: false, created_at: ts, updated_at: ts },
      { id: 6n, name: 'Other Guard', email: 'other@example.test', role: 'GUARD', is_active: true, created_at: ts, updated_at: ts },
      { id: 7n, name: 'Supervisor Two', email: 'supervisor2@example.test', role: 'SUPERVISOR', is_active: true, created_at: ts, updated_at: ts },
      { id: 8n, name: 'Terminated Guard', email: 'terminated@example.test', role: 'GUARD', is_active: true, created_at: ts, updated_at: ts },
    ],
    guards: [
      { id: 31n, user_id: 3n, employee_code: 'G-31', employment_status: 'ACTIVE' },
      { id: 32n, user_id: 4n, employee_code: 'G-32', employment_status: 'ON_LEAVE' },
      { id: 33n, user_id: 5n, employee_code: 'G-33', employment_status: 'ACTIVE' },
      { id: 34n, user_id: 6n, employee_code: 'G-34', employment_status: 'ACTIVE' },
      { id: 35n, user_id: 8n, employee_code: 'G-35', employment_status: 'TERMINATED' },
    ],
    supervisors: [{ id: 22n, user_id: 2n, employee_code: 'S-22', status: 'ACTIVE' }, { id: 23n, user_id: 7n, employee_code: 'S-23', status: 'ACTIVE' }],
    clients: [{ id: 15n, user_id: 10n, company_name: 'Test Client', status: 'ACTIVE' }],
    sites: [
      { id: 41n, client_id: 15n, supervisor_id: 22n, site_name: 'Site One', address: 'Road One', status: 'ACTIVE', required_guards: 1, created_at: ts },
      { id: 42n, client_id: 15n, supervisor_id: 23n, site_name: 'Site Two', address: 'Road Two', status: 'ACTIVE', required_guards: 1, created_at: ts },
      { id: 43n, client_id: 15n, supervisor_id: 22n, site_name: 'Inactive Site', address: 'Road Three', status: 'INACTIVE', required_guards: 1, created_at: ts },
    ],
    shifts: [
      { id: 51n, shift_name: 'Day', start_time: time('08:00:00'), end_time: time('16:00:00'), is_active: true, description: null },
      { id: 52n, shift_name: 'Evening', start_time: time('16:00:00'), end_time: time('22:00:00'), is_active: true, description: null },
      { id: 53n, shift_name: 'Night', start_time: time('22:00:00'), end_time: time('06:00:00'), is_active: true, description: null },
      { id: 54n, shift_name: 'Early', start_time: time('02:00:00'), end_time: time('10:00:00'), is_active: true, description: null },
      { id: 55n, shift_name: 'Disabled', start_time: time('09:00:00'), end_time: time('17:00:00'), is_active: false, description: null },
    ],
    assignments: [], leaves: [], audit_logs: [],
  };
}
function profileForUser(role, id) {
  const source = role === 'GUARD' ? state.guards : state.supervisors;
  return source.find((row) => row.user_id === id) ?? null;
}
function project(value, select) {
  if (!value) return null;
  if (!select) return value;
  const output = {};
  for (const [key, selection] of Object.entries(select)) {
    if (selection === true) output[key] = value[key];
    else if (selection?.select) {
      let relation = value[key];
      if (key === 'guards' && value.role === 'GUARD') relation = profileForUser('GUARD', value.id);
      if (key === 'supervisors' && value.role === 'SUPERVISOR') relation = profileForUser('SUPERVISOR', value.id);
      output[key] = project(relation, selection.select);
    }
  }
  return output;
}
function findUser(id) { return state.users.find((row) => row.id === id) ?? null; }
function authUser(id) {
  const user = findUser(id);
  if (!user) return null;
  return { ...user, guards: profileForUser('GUARD', id), supervisors: profileForUser('SUPERVISOR', id), clients: null };
}
function shiftRaw(row) {
  return { ...row, start_time: row.start_time.toISOString().slice(11, 19), end_time: row.end_time.toISOString().slice(11, 19) };
}
function assignmentResult(row) {
  const guard = state.guards.find((item) => item.id === row.guard_id);
  const site = state.sites.find((item) => item.id === row.site_id);
  const shift = state.shifts.find((item) => item.id === row.shift_id);
  const supervisor = state.supervisors.find((item) => item.id === site?.supervisor_id);
  return {
    ...row,
    guards: { ...guard, users: findUser(guard.user_id) },
    sites: { ...site, clients: state.clients.find((item) => item.id === site.client_id) },
    shifts: shift,
    users: findUser(row.assigned_by),
    _count: { assignments: 0 },
    supervisor_id: supervisor?.id,
  };
}
function matches(row, where) {
  if (!where) return true;
  if (where.AND && !where.AND.every((item) => matches(row, item))) return false;
  if (where.OR && !where.OR.some((item) => matches(row, item))) return false;
  for (const [field, expected] of Object.entries(where)) {
    if (field === 'AND' || field === 'OR') continue;
    if (field === 'sites') {
      const site = state.sites.find((item) => item.id === row.site_id);
      if (expected.is?.supervisor_id !== undefined && site?.supervisor_id !== expected.is.supervisor_id) return false;
      continue;
    }
    const actual = row[field];
    if (expected && typeof expected === 'object' && !(expected instanceof Date)) {
      if (expected.lte && actual > expected.lte) return false;
      if (expected.gte && actual < expected.gte) return false;
      if (Object.hasOwn(expected, 'not') && actual === expected.not) return false;
    } else if (actual !== expected) return false;
  }
  return true;
}
function day(value) { return value instanceof Date ? value.toISOString().slice(0, 10) : String(value).slice(0, 10); }
function raw(strings, ...values) {
  const sql = Array.from(strings).join('?');
  const id = values[0];
  if (sql.includes('FROM guards g JOIN users u')) {
    const guard = state.guards.find((row) => row.id === id);
    const user = guard && findUser(guard.user_id);
    return guard && user ? [{ id: guard.id, employment_status: guard.employment_status, is_active: user.is_active ? 1 : 0, role: user.role }] : [];
  }
  if (sql.includes('FROM sites WHERE id')) {
    const site = state.sites.find((row) => row.id === id);
    return site ? [{ id: site.id, status: site.status }] : [];
  }
  if (sql.includes('FROM shifts WHERE id')) {
    const shift = state.shifts.find((row) => row.id === id);
    return shift ? [{ id: shift.id, is_active: shift.is_active ? 1 : 0, start_time: shiftRaw(shift).start_time, end_time: shiftRaw(shift).end_time }] : [];
  }
  if (sql.includes('FROM assignments a JOIN shifts s')) {
    const [guardId] = values;
    return state.assignments.filter((row) => row.guard_id === guardId && row.status === 'ACTIVE').map((row) => {
      const shift = shiftRaw(state.shifts.find((item) => item.id === row.shift_id));
      return { id: row.id, start_date: day(row.start_date), end_date: row.end_date ? day(row.end_date) : null, start_time: shift.start_time, end_time: shift.end_time, site_id: row.site_id, shift_id: row.shift_id };
    });
  }
  if (sql.includes('FROM assignments WHERE id')) {
    const [assignmentId] = values;
    const row = state.assignments.find((item) => item.id === assignmentId);
    return row ? [{ id: row.id, site_id: row.site_id, shift_id: row.shift_id, start_date: row.start_date, end_date: row.end_date, status: row.status }] : [];
  }
  return [];
}
function assignmentModel() {
  return {
    findMany: async ({ where = {}, skip = 0, take = 100 } = {}) => state.assignments.filter((row) => matches(row, where)).slice(skip, skip + take).map(assignmentResult),
    findFirst: async ({ where = {} } = {}) => state.assignments.find((row) => matches(row, where)) ? assignmentResult(state.assignments.find((row) => matches(row, where))) : null,
    findUnique: async ({ where }) => state.assignments.find((row) => row.id === where.id) ?? null,
    count: async ({ where = {} } = {}) => state.assignments.filter((row) => matches(row, where)).length,
    create: async ({ data }) => { const row = { id: BigInt(1000 + state.assignments.length), created_at: ts, status: 'ACTIVE', ...data }; state.assignments.push(row); return row; },
    update: async ({ where, data }) => { const row = state.assignments.find((item) => item.id === where.id); Object.assign(row, data); return row; },
  };
}
function shiftModel() {
  return {
    findMany: async ({ where = {}, skip = 0, take = 100 } = {}) => state.shifts.filter((row) => (where.is_active === undefined || row.is_active === where.is_active) && (!where.shift_name?.contains || row.shift_name.toLowerCase().includes(where.shift_name.contains.toLowerCase()))).slice(skip, skip + take).map((row) => ({ ...row, _count: { assignments: state.assignments.filter((item) => item.shift_id === row.id && item.status === 'ACTIVE').length } })),
    findUnique: async ({ where }) => { const row = state.shifts.find((item) => item.id === where.id); return row ? { ...row, _count: { assignments: state.assignments.filter((item) => item.shift_id === row.id && item.status === 'ACTIVE').length } } : null; },
    count: async ({ where = {} } = {}) => state.shifts.filter((row) => where.is_active === undefined || row.is_active === where.is_active).length,
    create: async ({ data }) => { const row = { id: BigInt(100 + state.shifts.length), ...data }; state.shifts.push(row); return row; },
    update: async ({ where, data }) => { const row = state.shifts.find((item) => item.id === where.id); Object.assign(row, data); return row; },
  };
}
function siteModel() {
  return {
    findMany: async ({ where = {}, skip = 0, take = 500 } = {}) => state.sites.filter((row) => (!where.status || row.status === where.status) && (!where.supervisor_id || row.supervisor_id === where.supervisor_id)).slice(skip, skip + take).map((row) => ({ ...row, clients: state.clients.find((client) => client.id === row.client_id) })),
  };
}
function guardModel() {
  return {
    findMany: async ({ where = {}, skip = 0, take = 500 } = {}) => state.guards.filter((row) => (!where.employment_status || row.employment_status === where.employment_status) && (!where.assignments || state.assignments.some((assignment) => assignment.guard_id === row.id && state.sites.some((site) => site.id === assignment.site_id && site.supervisor_id === where.assignments.some.sites.is.supervisor_id)))).slice(skip, skip + take).map((row) => ({ ...row, users: findUser(row.user_id) })),
  };
}
function txClient() {
  const assignments = assignmentModel(); const shifts = shiftModel();
  return {
    $queryRaw: async (strings, ...values) => raw(strings, ...values),
    assignments,
    leaves: { findFirst: async ({ where }) => state.leaves.find((leave) => leave.guard_id === where.guard_id
      && where.status === 'APPROVED' && leave.status === 'APPROVED'
      && leave.end_date >= where.end_date.gte
      && (!where.start_date || leave.start_date <= where.start_date.lte)) ?? null },
    shifts,
    users: { findUnique: async ({ where, select }) => project(authUser(where.id), select) },
    audit_logs: { create: async ({ data }) => { const row = { id: BigInt(state.audit_logs.length + 1), ...data }; state.audit_logs.push(row); return row; } },
  };
}
function token(id, role) { const user = findUser(BigInt(id)); return jwt.sign({ sub: String(id), role, av: String(user.updated_at.getTime()) }, process.env.JWT_SECRET, { algorithm: 'HS256', issuer: 'secureguard-api', audience: 'secureguard-client', expiresIn: 3600 }); }
async function request(method, path, { id = '1', role = 'ADMIN', body, auth = true } = {}) {
  const response = await fetch(`http://127.0.0.1:${server.address().port}${path}`, { method, headers: { ...(auth ? { authorization: `Bearer ${token(id, role)}` } : {}), ...(body === undefined ? {} : { 'content-type': 'application/json' }) }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
  return { response, body: await response.json() };
}
function assignmentBody({ guard_id = '31', site_id = '41', shift_id = '51', start_date = today, end_date = today } = {}) { return { guard_id, site_id, shift_id, start_date, end_date }; }

before(async () => {
  process.env.JWT_SECRET = randomBytes(48).toString('base64url'); process.env.JWT_EXPIRES_IN = '1h'; state = seed();
  prisma.users.findUnique = async ({ where, select }) => project(authUser(where.id), select);
  prisma.$queryRaw = async (strings, ...values) => raw(strings, ...values);
  prisma.guards.findMany = guardModel().findMany;
  prisma.supervisors.findUnique = async ({ where }) => state.supervisors.find((row) => (where.id !== undefined && row.id === where.id) || (where.user_id !== undefined && row.user_id === where.user_id)) ?? null;
  prisma.sites.findMany = siteModel().findMany;
  prisma.shifts.findMany = shiftModel().findMany; prisma.shifts.findUnique = shiftModel().findUnique; prisma.shifts.count = shiftModel().count;
  prisma.assignments.findMany = assignmentModel().findMany; prisma.assignments.findFirst = assignmentModel().findFirst; prisma.assignments.count = assignmentModel().count;
  prisma.$transaction = async (callback) => { const snapshot = structuredClone(state); try { return await callback(txClient()); } catch (error) { state = snapshot; throw error; } };
  server = app.listen(0, '127.0.0.1'); await new Promise((resolve) => server.once('listening', resolve));
});
after(async () => {
  if (server?.listening) await new Promise((resolve) => server.close(resolve));
  prisma.$transaction = original.transaction; prisma.$queryRaw = original.query;
  for (const [key, value] of Object.entries(original.users)) prisma.users[key] = value;
  for (const [key, value] of Object.entries(original.guards)) prisma.guards[key] = value;
  for (const [key, value] of Object.entries(original.supervisors)) prisma.supervisors[key] = value;
  for (const [key, value] of Object.entries(original.sites)) prisma.sites[key] = value;
  for (const [key, value] of Object.entries(original.shifts)) prisma.shifts[key] = value;
  for (const [key, value] of Object.entries(original.assignments)) prisma.assignments[key] = value;
});

test('shift APIs validate overnight times, audit changes, and restrict modifications', { concurrency: false }, async () => {
  const denied = await request('POST', '/api/shifts', { id: '2', role: 'SUPERVISOR', body: { shift_name: 'Forbidden', start_time: '08:00', end_time: '16:00' } }); assert.equal(denied.response.status, 403);
  const invalid = await request('POST', '/api/shifts', { body: { shift_name: 'Zero', start_time: '08:00', end_time: '08:00' } }); assert.equal(invalid.response.status, 400);
  const created = await request('POST', '/api/shifts', { body: { shift_name: 'Synthetic Night', start_time: '22:00', end_time: '06:00', description: 'Test shift' } });
  assert.equal(created.response.status, 201); assert.equal(created.body.shift.start_time, '22:00:00'); assert.equal(state.audit_logs.at(-1).action, 'SHIFT_CREATED');
  const edited = await request('PUT', `/api/shifts/${created.body.shift.id}`, { body: { shift_name: 'Synthetic Overnight' } }); assert.equal(edited.response.status, 200); assert.equal(state.audit_logs.at(-1).action, 'SHIFT_UPDATED');
  const inactive = await request('PATCH', `/api/shifts/${created.body.shift.id}/status`, { body: { is_active: false } }); assert.equal(inactive.response.status, 200); assert.equal(inactive.body.shift.is_active, false); assert.equal(state.audit_logs.at(-1).action, 'SHIFT_STATUS_CHANGED');
});

test('assignment validation rejects ineligible records and enforces daily, adjacent, and overnight conflicts', { concurrency: false }, async () => {
  const created = await request('POST', '/api/assignments', { body: assignmentBody() }); assert.equal(created.response.status, 201); assert.equal(state.audit_logs.at(-1).action, 'ASSIGNMENT_CREATED');
  const overlap = await request('POST', '/api/assignments', { body: assignmentBody({ shift_id: '54' }) }); assert.equal(overlap.response.status, 409);
  const adjacent = await request('POST', '/api/assignments', { body: assignmentBody({ shift_id: '52' }) }); assert.equal(adjacent.response.status, 201);
  const editConflict = await request('PUT', `/api/assignments/${adjacent.body.assignment.id}`, { body: { shift_id: '54' } }); assert.equal(editConflict.response.status, 409);
  const safeEdit = await request('PUT', `/api/assignments/${adjacent.body.assignment.id}`, { body: { site_id: '41', shift_id: '52', start_date: today, end_date: today } }); assert.equal(safeEdit.response.status, 200); assert.equal(state.audit_logs.at(-1).action, 'ASSIGNMENT_UPDATED');
  const invalidGuard = await request('POST', '/api/assignments', { body: assignmentBody({ guard_id: '999' }) }); assert.equal(invalidGuard.response.status, 400);
  const leaveGuard = await request('POST', '/api/assignments', { body: assignmentBody({ guard_id: '32', site_id: '42' }) }); assert.equal(leaveGuard.response.status, 400);
  const inactiveGuard = await request('POST', '/api/assignments', { body: assignmentBody({ guard_id: '33', site_id: '42' }) }); assert.equal(inactiveGuard.response.status, 400);
  const terminatedGuard = await request('POST', '/api/assignments', { body: assignmentBody({ guard_id: '35', site_id: '42' }) }); assert.equal(terminatedGuard.response.status, 400);
  const inactiveSite = await request('POST', '/api/assignments', { body: assignmentBody({ guard_id: '34', site_id: '43' }) }); assert.equal(inactiveSite.response.status, 400);
  const inactiveShift = await request('POST', '/api/assignments', { body: assignmentBody({ guard_id: '34', site_id: '42', shift_id: '55' }) }); assert.equal(inactiveShift.response.status, 400);
  const usedShiftEdit = await request('PUT', '/api/shifts/51', { body: { start_time: '08:30' } }); assert.equal(usedShiftEdit.response.status, 409);
  const usedShiftDeactivate = await request('PATCH', '/api/shifts/51/status', { body: { is_active: false } }); assert.equal(usedShiftDeactivate.response.status, 409);
  const invalidRange = await request('POST', '/api/assignments', { body: assignmentBody({ guard_id: '34', site_id: '42', start_date: '2026-12-03', end_date: '2026-12-02' }) }); assert.equal(invalidRange.response.status, 400);
  const overnight = await request('POST', '/api/assignments', { body: assignmentBody({ guard_id: '34', site_id: '42', shift_id: '53' }) }); assert.equal(overnight.response.status, 201);
  const nextDayOverlap = await request('POST', '/api/assignments', { body: assignmentBody({ guard_id: '34', site_id: '42', shift_id: '54', start_date: shiftDayForTest(today, 1), end_date: shiftDayForTest(today, 1) }) }); assert.equal(nextDayOverlap.response.status, 409);
  const leaveStart = shiftDayForTest(today, 4); const leaveEnd = shiftDayForTest(today, 5);
  state.leaves.push({ guard_id: 34n, status: 'APPROVED', start_date: new Date(`${leaveStart}T00:00:00.000Z`), end_date: new Date(`${leaveEnd}T00:00:00.000Z`) });
  const approvedLeaveConflict = await request('POST', '/api/assignments', { body: assignmentBody({ guard_id: '34', site_id: '42', shift_id: '51', start_date: leaveStart, end_date: leaveEnd }) }); assert.equal(approvedLeaveConflict.response.status, 409);
  const list = await request('GET', `/api/assignments?from=${today}&to=${today}`); assert.equal(list.response.status, 200); assert.ok(list.body.pagination.total >= 3);
  const schedule = await request('GET', `/api/schedule?from=${today}&to=${today}`); assert.equal(schedule.response.status, 200); assert.ok(schedule.body.assignments.length >= 3);
});

test('supervisor scheduling visibility is site-scoped and assignments end without deletion', { concurrency: false }, async () => {
  const otherSiteAssignment = await request('POST', '/api/assignments', { body: assignmentBody({ guard_id: '34', site_id: '42', shift_id: '51' }) });
  assert.equal(otherSiteAssignment.response.status, 201);
  const scopedList = await request('GET', '/api/assignments', { id: '2', role: 'SUPERVISOR' }); assert.equal(scopedList.response.status, 200); assert.ok(scopedList.body.assignments.every((item) => item.site.id === '41'));
  const deniedDetail = await request('GET', `/api/assignments/${otherSiteAssignment.body.assignment.id}`, { id: '2', role: 'SUPERVISOR' }); assert.equal(deniedDetail.response.status, 404);
  const forbidden = await request('POST', '/api/assignments', { id: '2', role: 'SUPERVISOR', body: assignmentBody() }); assert.equal(forbidden.response.status, 403);
  const target = state.assignments.find((row) => row.id.toString() === otherSiteAssignment.body.assignment.id);
  const ended = await request('PATCH', `/api/assignments/${target.id}/end`, { body: { end_date: shiftDayForTest(today, 1) } }); assert.equal(ended.response.status, 400);
  const stillPresent = await request('GET', `/api/assignments/${target.id}`); assert.equal(stillPresent.response.status, 200);
  const finished = await request('PATCH', `/api/assignments/${target.id}/end`, { body: { end_date: today } }); assert.equal(finished.response.status, 200, JSON.stringify(finished.body)); assert.equal(finished.body.assignment.status, 'COMPLETED'); assert.equal(state.audit_logs.at(-1).action, 'ASSIGNMENT_ENDED');
  assert.ok(state.assignments.some((row) => row.id === target.id));
});

function shiftDayForTest(value, days) { const date = new Date(`${value}T00:00:00.000Z`); date.setUTCDate(date.getUTCDate() + days); return date.toISOString().slice(0, 10); }
