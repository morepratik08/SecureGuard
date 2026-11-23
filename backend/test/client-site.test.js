import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import { randomBytes } from 'node:crypto';
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import prisma from '../src/config/prisma.js';
import app from '../src/app.js';

const original = {
  query: prisma.$queryRaw, transaction: prisma.$transaction,
  users: { ...prisma.users }, clients: { ...prisma.clients }, sites: { ...prisma.sites },
  supervisors: { ...prisma.supervisors }, assignments: { ...prisma.assignments },
};
const now = new Date('2026-01-01T00:00:00.000Z');
let state; let server;

function seed() {
  const users = [
    { id: 1n, name: 'Admin', email: 'admin@test.invalid', role: 'ADMIN', is_active: true, created_at: now, updated_at: now },
    { id: 2n, name: 'Client One', email: 'one@test.invalid', role: 'CLIENT', is_active: true, created_at: now, updated_at: now },
    { id: 3n, name: 'Client Two', email: 'two@test.invalid', role: 'CLIENT', is_active: true, created_at: now, updated_at: now },
    { id: 4n, name: 'Supervisor', email: 'sup@test.invalid', role: 'SUPERVISOR', is_active: true, created_at: now, updated_at: now },
    { id: 5n, name: 'Guard', email: 'guard@test.invalid', role: 'GUARD', is_active: true, created_at: now, updated_at: now, guards: { employment_status: 'ACTIVE' } },
  ];
  return {
    users,
    clients: [
      { id: 20n, user_id: 2n, company_name: 'One Co', contact_person: 'One Contact', company_email: 'contact@one.test', phone: '111', billing_address: null, gstin: null, status: 'ACTIVE' },
      { id: 21n, user_id: 3n, company_name: 'Two Co', contact_person: null, company_email: null, phone: null, billing_address: null, gstin: null, status: 'ACTIVE' },
    ],
    supervisors: [{ id: 30n, user_id: 4n, employee_code: 'S-1', joining_date: now, status: 'ACTIVE' }],
    sites: [{ id: 40n, client_id: 20n, supervisor_id: 30n, site_name: 'North', address: 'Address North', required_guards: 1, status: 'ACTIVE', created_at: now }],
    assignments: [], audit_logs: [],
  };
}
function userRecord(id) { return state.users.find((row) => row.id === id) ?? null; }
function project(row, select) {
  if (!row) return null;
  if (!select) return row;
  const result = {};
  for (const [key, selection] of Object.entries(select)) {
    if (selection === true) result[key] = row[key];
    else if (selection?.select) {
      let relation = row[key];
      if (key === 'clients') relation = state.clients.find((item) => item.user_id === row.id) ?? null;
      if (key === 'supervisors') relation = state.supervisors.find((item) => item.user_id === row.id) ?? null;
      if (key === 'users' && row.user_id) relation = userRecord(row.user_id);
      result[key] = project(relation, selection.select);
    }
  }
  return result;
}
function userWithAuth(id) {
  const user = userRecord(id);
  if (!user) return null;
  return { ...user, clients: state.clients.find(({ user_id }) => user_id === id) ?? null, supervisors: state.supervisors.find(({ user_id }) => user_id === id) ?? null };
}
function siteResult(site) {
  const client = state.clients.find(({ id }) => id === site.client_id);
  const supervisor = state.supervisors.find(({ id }) => id === site.supervisor_id);
  const assignments = state.assignments.filter((row) => row.site_id === site.id && row.status === 'ACTIVE').map((row) => ({ ...row, guards: { employee_code: row.employee_code ?? 'G-1', users: { id: row.guard_user_id ?? 80n, name: 'Guard' } } }));
  return { ...site, clients: client, supervisors: supervisor ? { ...supervisor, users: userRecord(supervisor.user_id) } : null, assignments, _count: { assignments: assignments.length } };
}
function queryRaw(strings, ...values) {
  const sql = Array.from(strings).join('?');
  if (sql.includes('GET_LOCK')) return [{ acquired: 1 }];
  if (sql.includes('RELEASE_LOCK')) return [{ released: 1 }];
  if (sql.includes('FROM sites WHERE id')) {
    const site = state.sites.find((row) => row.id === values[0]);
    return site ? [{ ...site }] : [];
  }
  if (sql.includes('LOWER(TRIM(email))')) return state.users.filter((row) => row.email.trim().toLowerCase() === values[0].toLowerCase() && row.id !== values[1]).slice(0, 1).map(({ id }) => ({ id }));
  return [];
}
function modelClient() {
  return {
    findMany: async ({ where = {}, skip = 0, take = 100, orderBy } = {}) => {
      let rows = state.clients.filter((item) => (!where.user_id || item.user_id === where.user_id) && (!where.status || item.status === where.status));
      if (where.OR) rows = rows.filter((item) => where.OR.some((condition) => Object.entries(condition).some(([key, val]) => {
        const target = key === 'users' ? (userRecord(item.user_id)?.email ?? '') : item[key] ?? '';
        return String(target).toLowerCase().includes(String(val.contains).toLowerCase());
      })));
      if (orderBy) rows = rows.sort((a, b) => a.company_name.localeCompare(b.company_name));
      return rows.slice(skip, skip + take).map((item) => ({ ...item, users: userRecord(item.user_id), _count: { sites: state.sites.filter((site) => site.client_id === item.id).length } }));
    },
    findFirst: async ({ where = {}, include } = {}) => {
      const row = state.clients.find((item) => (where.id === undefined || item.id === where.id) && (where.user_id === undefined || item.user_id === where.user_id));
      if (!row) return null;
      if (include?.sites) return { ...row, users: userRecord(row.user_id), sites: state.sites.filter((site) => site.client_id === row.id).map(siteResult), invoices: [], _count: { sites: state.sites.filter((site) => site.client_id === row.id).length } };
      return { ...row, users: userRecord(row.user_id) };
    },
    findUnique: async ({ where }) => { const row = state.clients.find((item) => (where.id !== undefined && item.id === where.id) || (where.user_id !== undefined && item.user_id === where.user_id)); return row ? { ...row, users: userRecord(row.user_id) } : null; },
    count: async ({ where = {} } = {}) => state.clients.filter((item) => (!where.status || item.status === where.status) && (!where.user_id || item.user_id === where.user_id)).length,
    create: async ({ data }) => { const row = { id: BigInt(100 + state.clients.length), status: 'ACTIVE', ...data }; state.clients.push(row); return row; },
    update: async ({ where, data }) => { const row = state.clients.find((item) => item.id === where.id); Object.assign(row, data); return row; },
  };
}
function modelSite() {
  return {
    findMany: async ({ where = {}, skip = 0, take = 100 } = {}) => state.sites.filter((site) => (!where.client_id || site.client_id === where.client_id) && (!where.supervisor_id || site.supervisor_id === where.supervisor_id) && (!where.status || site.status === where.status)).slice(skip, skip + take).map(siteResult),
    findFirst: async ({ where = {} } = {}) => { const row = state.sites.find((site) => site.id === where.id && (!where.client_id || site.client_id === where.client_id) && (!where.supervisor_id || site.supervisor_id === where.supervisor_id)); return row ? siteResult(row) : null; },
    findUnique: async ({ where }) => state.sites.find((site) => site.id === where.id) ?? null,
    count: async ({ where = {} } = {}) => state.sites.filter((site) => (!where.client_id || site.client_id === where.client_id) && (!where.supervisor_id || site.supervisor_id === where.supervisor_id)).length,
    create: async ({ data }) => { const row = { id: BigInt(40 + state.sites.length), created_at: now, status: 'ACTIVE', ...data }; state.sites.push(row); return row; },
    update: async ({ where, data }) => { const row = state.sites.find((site) => site.id === where.id); Object.assign(row, data); return row; },
  };
}
function txClient() {
  const clients = modelClient(); const sites = modelSite();
  return {
    $queryRaw: async (strings, ...values) => queryRaw(strings, ...values),
    users: {
      findUnique: async ({ where, select }) => project(userWithAuth(where.id), select),
      create: async ({ data, select }) => { const row = { id: BigInt(Math.max(...state.users.map((item) => Number(item.id))) + 1), ...data, created_at: now, updated_at: now }; state.users.push(row); return project(row, select); },
      update: async ({ where, data }) => { const row = userRecord(where.id); Object.assign(row, data); return row; },
    },
    clients,
    sites,
    supervisors: {
      findUnique: async ({ where }) => { const row = state.supervisors.find((item) => (where.id !== undefined && item.id === where.id) || (where.user_id !== undefined && item.user_id === where.user_id)); return row ? { ...row, users: userRecord(row.user_id) } : null; },
    },
    assignments: { count: async ({ where }) => state.assignments.filter((row) => row.site_id === where.site_id && (!where.status || row.status === where.status)).length },
    attendance: { count: async () => 0 },
    incidents: { count: async () => 0 },
    audit_logs: { create: async ({ data }) => { const row = { id: BigInt(state.audit_logs.length + 1), ...data }; state.audit_logs.push(row); return row; } },
  };
}
function token(id, role) { const row = userRecord(BigInt(id)); return jwt.sign({ sub: String(id), role, av: String(row.updated_at.getTime()) }, process.env.JWT_SECRET, { algorithm: 'HS256', issuer: 'secureguard-api', audience: 'secureguard-client', expiresIn: 3600 }); }
async function call(method, path, { id = '1', role = 'ADMIN', body, auth = true, accessToken } = {}) {
  const response = await fetch(`http://127.0.0.1:${server.address().port}${path}`, { method, headers: { ...(auth ? { authorization: `Bearer ${accessToken ?? token(id, role)}` } : {}), ...(body ? { 'content-type': 'application/json' } : {}) }, ...(body ? { body: JSON.stringify(body) } : {}) });
  return { response, body: await response.json() };
}

before(async () => {
  process.env.JWT_SECRET = randomBytes(48).toString('base64url'); process.env.JWT_EXPIRES_IN = '1h'; state = seed();
  prisma.users.findUnique = async ({ where, select }) => project(userWithAuth(where.id), select);
  prisma.$queryRaw = async (strings, ...values) => queryRaw(strings, ...values);
  prisma.clients.findMany = modelClient().findMany; prisma.clients.findFirst = modelClient().findFirst; prisma.clients.findUnique = modelClient().findUnique; prisma.clients.count = modelClient().count;
  prisma.sites.findMany = modelSite().findMany; prisma.sites.findFirst = modelSite().findFirst; prisma.sites.findUnique = modelSite().findUnique; prisma.sites.count = modelSite().count;
  prisma.supervisors.findUnique = async ({ where }) => { const row = state.supervisors.find((item) => (where.id !== undefined && item.id === where.id) || (where.user_id !== undefined && item.user_id === where.user_id)); return row ? { ...row, users: userRecord(row.user_id) } : null; };
  prisma.supervisors.findMany = async () => state.supervisors.filter((item) => item.status === 'ACTIVE').map((item) => ({ ...item, users: userRecord(item.user_id) }));
  prisma.$transaction = async (callback) => { const snapshot = structuredClone(state); try { return await callback(txClient()); } catch (error) { state = snapshot; throw error; } };
  server = app.listen(0, '127.0.0.1'); await new Promise((resolve) => server.once('listening', resolve));
});
after(async () => {
  if (server?.listening) await new Promise((resolve) => server.close(resolve));
  prisma.$queryRaw = original.query; prisma.$transaction = original.transaction;
  for (const [key, value] of Object.entries(original.users)) prisma.users[key] = value;
  for (const [key, value] of Object.entries(original.clients)) prisma.clients[key] = value;
  for (const [key, value] of Object.entries(original.sites)) prisma.sites[key] = value;
  for (const [key, value] of Object.entries(original.supervisors)) prisma.supervisors[key] = value;
  for (const [key, value] of Object.entries(original.assignments)) prisma.assignments[key] = value;
});

test('client creation validates, hashes via provisioning service, audits, and prevents cross-organization access', { concurrency: false }, async () => {
  const payload = { name: 'Synthetic Client', email: 'New.Client@EXAMPLE.TEST', password: 'SecureClientPass!234', role: 'CLIENT', profile: { company_name: 'Synthetic Co', company_email: 'OPS@SYNTHETIC.TEST' } };
  const created = await call('POST', '/api/clients', { body: payload });
  assert.equal(created.response.status, 201); assert.equal(created.body.client.email, 'new.client@example.test');
  assert.equal(Object.hasOwn(created.body.client, 'password_hash'), false); assert.equal(state.audit_logs.at(-1).action, 'CLIENT_CREATED');
  assert.equal(await bcrypt.compare(payload.password, state.users.find((row) => row.email === 'new.client@example.test').password_hash), true);
  const duplicate = await call('POST', '/api/clients', { body: { ...payload, email: ' ADMIN@TEST.INVALID ' } });
  assert.equal(duplicate.response.status, 409);
  const own = await call('GET', '/api/clients/20', { id: '2', role: 'CLIENT' }); assert.equal(own.response.status, 200);
  const other = await call('GET', '/api/clients/21', { id: '2', role: 'CLIENT' }); assert.equal(other.response.status, 404);
  const forbidden = await call('POST', '/api/clients', { id: '4', role: 'SUPERVISOR', body: payload }); assert.equal(forbidden.response.status, 403);
});

test('client update/status enforce ownership, audit, and invalidate sessions', { concurrency: false }, async () => {
  const priorToken = token('2', 'CLIENT');
  const update = await call('PUT', '/api/clients/21', { id: '2', role: 'CLIENT', body: { company_name: 'Hijack' } }); assert.equal(update.response.status, 404);
  const own = await call('PUT', '/api/clients/20', { id: '2', role: 'CLIENT', body: { company_name: 'One Updated', email: 'ONE-UPDATED@test.invalid' } });
  assert.equal(own.response.status, 200); assert.equal(own.body.client.company_name, 'One Updated'); assert.equal(state.audit_logs.at(-1).action, 'CLIENT_UPDATED');
  const disabled = await call('PATCH', '/api/clients/20/status', { body: { status: 'INACTIVE' } }); assert.equal(disabled.response.status, 200);
  assert.equal(state.users.find((row) => row.id === 2n).is_active, false); assert.equal(state.audit_logs.at(-1).action, 'CLIENT_STATUS_CHANGED');
  const revoked = await call('GET', '/api/clients/me', { id: '2', role: 'CLIENT', accessToken: priorToken }); assert.equal(revoked.response.status, 401);
});

test('site creation validates related active records, scopes supervisor/client views, and preserves active deployments', { concurrency: false }, async () => {
  state.clients.find((row) => row.id === 20n).status = 'ACTIVE';
  state.users.find((row) => row.id === 2n).is_active = true;
  const body = { site_name: 'West Site', address: '100 Test Road', client_id: '20', supervisor_id: '30', required_guards: 2 };
  const created = await call('POST', '/api/sites', { body }); assert.equal(created.response.status, 201, JSON.stringify(created.body)); assert.equal(state.audit_logs.at(-1).action, 'SITE_CREATED');
  const unassigned = await call('POST', '/api/sites', { body: { site_name: 'Client Two Site', address: '200 Test Road', client_id: '21' } }); assert.equal(unassigned.response.status, 201);
  const invalidClient = await call('POST', '/api/sites', { body: { ...body, client_id: '999' } }); assert.equal(invalidClient.response.status, 400);
  const invalidSupervisor = await call('POST', '/api/sites', { body: { ...body, supervisor_id: '999' } }); assert.equal(invalidSupervisor.response.status, 400);
  const supervisorList = await call('GET', '/api/sites', { id: '4', role: 'SUPERVISOR' }); assert.equal(supervisorList.response.status, 200); assert.equal(supervisorList.body.pagination.total, 2);
  const supervisorIsolation = await call('GET', '/api/sites/42', { id: '4', role: 'SUPERVISOR' }); assert.equal(supervisorIsolation.response.status, 404);
  const clientList = await call('GET', '/api/sites', { id: '2', role: 'CLIENT' }); assert.equal(clientList.response.status, 200); assert.equal(clientList.body.pagination.total, 2);
  const isolated = await call('GET', '/api/sites/41', { id: '3', role: 'CLIENT' }); assert.equal(isolated.response.status, 404);
  state.assignments.push({ site_id: 40n, status: 'ACTIVE', guard_id: 99n });
  const deactivate = await call('PATCH', '/api/sites/40/status', { body: { status: 'INACTIVE' } }); assert.equal(deactivate.response.status, 409);
  state.assignments[0].status = 'COMPLETED';
  const inactive = await call('PATCH', '/api/sites/40/status', { body: { status: 'INACTIVE' } }); assert.equal(inactive.response.status, 200); assert.equal(state.sites[0].status, 'INACTIVE'); assert.equal(state.audit_logs.at(-1).action, 'SITE_STATUS_CHANGED');
  const moveClient = await call('PUT', '/api/sites/40', { body: { client_id: '21' } }); assert.equal(moveClient.response.status, 409);
  const update = await call('PUT', '/api/sites/40', { body: { address: 'Updated Road' } }); assert.equal(update.response.status, 200); assert.equal(state.audit_logs.at(-1).action, 'SITE_UPDATED');
  const guard = await call('GET', '/api/sites', { id: '5', role: 'GUARD' }); assert.equal(guard.response.status, 403);
});
