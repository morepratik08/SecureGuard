import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import { randomBytes, randomUUID } from 'node:crypto';
import { bootstrapIntegrationTest } from './integration-test-bootstrap.js';

// URL validation happens before the bootstrap dynamically imports Prisma or Express.
const { app, prisma, bcrypt } = await bootstrapIntegrationTest(process.env.SECUREGUARD_TEST_DATABASE_URL);

const runId = randomUUID().replaceAll('-', '').slice(0, 16).toLowerCase();
const labelPrefix = `sgp6-${runId}`;
const emailPrefix = `${labelPrefix}-`;
const password = `Phase6-${randomBytes(18).toString('base64url')}!9a`;
const ids = { users: [], guards: [], supervisors: [], clients: [], sites: [], shifts: [], assignments: [], incidents: [], documents: [] };
const fixtures = {};
let server;
let connected = false;
let forwarded = 1;

function dateOnly(value = new Date()) {
  return new Date(Date.UTC(value.getUTCFullYear(), value.getUTCMonth(), value.getUTCDate()));
}

function nextDate(value = new Date()) {
  const result = dateOnly(value);
  result.setUTCDate(result.getUTCDate() + 1);
  return result;
}

function time(value) { return new Date(`1970-01-01T${value}Z`); }

async function api(method, path, { token = fixtures.adminToken, body } = {}) {
  const ip = forwarded++;
  const response = await fetch(`http://127.0.0.1:${server.address().port}${path}`, {
    method,
    headers: {
      'content-type': 'application/json',
      'x-forwarded-for': `198.51.${Math.floor(ip / 250) % 250}.${(ip % 250) + 1}`,
      ...(token ? { authorization: `Bearer ${token}` } : {}),
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  return { response, body: await response.json() };
}

async function createUser(tx, label, role) {
  const row = await tx.users.create({ data: {
    name: `Phase 6 ${label}`,
    email: `${emailPrefix}${label}@example.test`,
    password_hash: await bcrypt.hash(password, 4),
    role,
    is_active: true,
  }, select: { id: true, email: true } });
  return row;
}

async function login(email) {
  const { response, body } = await api('POST', '/api/auth/login', { token: null, body: { email, password } });
  assert.equal(response.status, 200, `login failed for fixture ${email}`);
  return body.token;
}

async function createFixtures() {
  const created = await prisma.$transaction(async (tx) => {
    const superAdmin = await createUser(tx, 'super-admin', 'SUPER_ADMIN');
    const admin = await createUser(tx, 'admin', 'ADMIN');
    const supervisorOneUser = await createUser(tx, 'supervisor-one', 'SUPERVISOR');
    const supervisorTwoUser = await createUser(tx, 'supervisor-two', 'SUPERVISOR');
    const clientOneUser = await createUser(tx, 'client-one', 'CLIENT');
    const clientTwoUser = await createUser(tx, 'client-two', 'CLIENT');
    const guardOneUser = await createUser(tx, 'guard-one', 'GUARD');
    const guardTwoUser = await createUser(tx, 'guard-two', 'GUARD');

    const supervisorOne = await tx.supervisors.create({ data: {
      user_id: supervisorOneUser.id, employee_code: `P6-${runId}-S1`, joining_date: dateOnly(), status: 'ACTIVE',
    } });
    const supervisorTwo = await tx.supervisors.create({ data: {
      user_id: supervisorTwoUser.id, employee_code: `P6-${runId}-S2`, joining_date: dateOnly(), status: 'ACTIVE',
    } });
    const clientOne = await tx.clients.create({ data: {
      user_id: clientOneUser.id, company_name: `Phase 6 ${runId} Client One`, status: 'ACTIVE',
    } });
    const clientTwo = await tx.clients.create({ data: {
      user_id: clientTwoUser.id, company_name: `Phase 6 ${runId} Client Two`, status: 'ACTIVE',
    } });
    const guardOne = await tx.guards.create({ data: {
      user_id: guardOneUser.id, employee_code: `P6-${runId}-G1`, joining_date: dateOnly(),
      base_salary: '25000.00', employment_status: 'ACTIVE',
    } });
    const guardTwo = await tx.guards.create({ data: {
      user_id: guardTwoUser.id, employee_code: `P6-${runId}-G2`, joining_date: dateOnly(),
      base_salary: '25000.00', employment_status: 'ACTIVE',
    } });
    const siteOne = await tx.sites.create({ data: {
      client_id: clientOne.id, supervisor_id: supervisorOne.id,
      site_name: `Phase 6 ${runId} Site One`, address: 'Integration fixture site one', status: 'ACTIVE',
    } });
    const siteTwo = await tx.sites.create({ data: {
      client_id: clientTwo.id, supervisor_id: supervisorTwo.id,
      site_name: `Phase 6 ${runId} Site Two`, address: 'Integration fixture site two', status: 'ACTIVE',
    } });
    const shift = await tx.shifts.create({ data: {
      shift_name: `P6 ${runId} Day Shift`, start_time: time('08:00:00'), end_time: time('16:00:00'),
      description: 'Phase 6 integration fixture', is_active: true,
    } });
    const assignmentOne = await tx.assignments.create({ data: {
      guard_id: guardOne.id, site_id: siteOne.id, shift_id: shift.id, assigned_by: admin.id,
      start_date: dateOnly(), end_date: nextDate(), status: 'ACTIVE',
    } });
    const assignmentTwo = await tx.assignments.create({ data: {
      guard_id: guardTwo.id, site_id: siteTwo.id, shift_id: shift.id, assigned_by: admin.id,
      start_date: dateOnly(), end_date: nextDate(), status: 'ACTIVE',
    } });

    return {
      users: [superAdmin, admin, supervisorOneUser, supervisorTwoUser, clientOneUser, clientTwoUser, guardOneUser, guardTwoUser],
      supervisors: [supervisorOne, supervisorTwo], clients: [clientOne, clientTwo], guards: [guardOne, guardTwo],
      sites: [siteOne, siteTwo], shifts: [shift], assignments: [assignmentOne, assignmentTwo],
      user: { superAdmin, admin, supervisorOneUser, supervisorTwoUser, clientOneUser, clientTwoUser, guardOneUser, guardTwoUser },
      supervisor: { one: supervisorOne, two: supervisorTwo }, client: { one: clientOne, two: clientTwo },
      guard: { one: guardOne, two: guardTwo }, site: { one: siteOne, two: siteTwo },
    };
  });

  for (const key of ['users', 'supervisors', 'clients', 'guards', 'sites', 'shifts', 'assignments']) {
    ids[key].push(...created[key].map((row) => row.id));
  }
  Object.assign(fixtures, created);
  fixtures.superAdminToken = await login(created.user.superAdmin.email);
  fixtures.adminToken = await login(created.user.admin.email);
  fixtures.supervisorOneToken = await login(created.user.supervisorOneUser.email);
  fixtures.supervisorTwoToken = await login(created.user.supervisorTwoUser.email);
  fixtures.clientOneToken = await login(created.user.clientOneUser.email);
  fixtures.guardOneToken = await login(created.user.guardOneUser.email);
  fixtures.guardTwoToken = await login(created.user.guardTwoUser.email);
}

async function cleanup() {
  if (!connected) return;
  await prisma.$transaction(async (tx) => {
    const auditOr = [];
    if (ids.incidents.length) auditOr.push({ entity_type: 'INCIDENT', entity_id: { in: ids.incidents } });
    if (ids.documents.length) auditOr.push({ entity_type: 'DOCUMENT', entity_id: { in: ids.documents } });
    if (auditOr.length) await tx.audit_logs.deleteMany({ where: { OR: auditOr } });
    if (ids.incidents.length) await tx.incidents.deleteMany({ where: { id: { in: ids.incidents } } });
    if (ids.documents.length) await tx.documents.deleteMany({ where: { id: { in: ids.documents } } });
    if (ids.assignments.length) await tx.assignments.deleteMany({ where: { id: { in: ids.assignments } } });
    if (ids.sites.length) await tx.sites.deleteMany({ where: { id: { in: ids.sites } } });
    if (ids.shifts.length) await tx.shifts.deleteMany({ where: { id: { in: ids.shifts } } });
    if (ids.guards.length) await tx.guards.deleteMany({ where: { id: { in: ids.guards } } });
    if (ids.supervisors.length) await tx.supervisors.deleteMany({ where: { id: { in: ids.supervisors } } });
    if (ids.clients.length) await tx.clients.deleteMany({ where: { id: { in: ids.clients } } });
    if (ids.users.length) await tx.users.deleteMany({ where: { id: { in: ids.users } } });
  });
}

before(async () => {
  await prisma.$connect();
  connected = true;
  const engines = await prisma.$queryRaw`SELECT TABLE_NAME AS table_name, ENGINE AS engine FROM information_schema.TABLES WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME IN ('incidents', 'audit_logs')`;
  assert.equal(engines.length, 2, 'required Phase 6 tables must exist in the selected test database');
  assert.ok(engines.every((table) => table.engine === 'InnoDB'), 'incident and audit tables must use InnoDB for rollback verification');
  app.set('trust proxy', 'loopback');
  server = app.listen(0, '127.0.0.1');
  await new Promise((resolve, reject) => { server.once('listening', resolve); server.once('error', reject); });
  await createFixtures();
});

after(async () => {
  try {
    if (server?.listening) await new Promise((resolve) => server.close(resolve));
    await cleanup();
  } finally {
    await prisma.$disconnect();
  }
});

test('live incident creation uses authenticated identity and enforces site ownership', { concurrency: false }, async () => {
  const now = new Date().toISOString();
  const created = await api('POST', '/api/incidents', { token: fixtures.guardOneToken, body: {
    site_id: fixtures.site.one.id.toString(), incident_title: `P6 ${runId} guard report`,
    description: 'Synthetic integration incident for permission and persistence checks.', severity: 'HIGH', incident_time: now,
  } });
  assert.equal(created.response.status, 201);
  assert.equal(created.body.incident.reporter.id, fixtures.user.guardOneUser.id.toString());
  assert.equal(created.body.incident.reporter.role, 'GUARD');
  const guardIncidentId = BigInt(created.body.incident.id);
  ids.incidents.push(guardIncidentId);
  fixtures.incident = { guard: guardIncidentId };
  const persisted = await prisma.incidents.findUnique({ where: { id: guardIncidentId } });
  assert.equal(persisted.reported_by, fixtures.user.guardOneUser.id);
  assert.equal(persisted.site_id, fixtures.site.one.id);

  const spoofed = await api('POST', '/api/incidents', { token: fixtures.guardOneToken, body: {
    site_id: fixtures.site.one.id.toString(), reported_by: fixtures.user.guardTwoUser.id.toString(),
    incident_title: 'Impersonation attempt', description: 'Must be rejected.', incident_time: now,
  } });
  assert.equal(spoofed.response.status, 400);
  const invalidSite = await api('POST', '/api/incidents', { token: fixtures.guardOneToken, body: {
    site_id: 'not-an-id', incident_title: 'Invalid site', description: 'Must be rejected.', incident_time: now,
  } });
  assert.equal(invalidSite.response.status, 400);
  const unrelatedSite = await api('POST', '/api/incidents', { token: fixtures.guardOneToken, body: {
    site_id: fixtures.site.two.id.toString(), incident_title: 'Out of scope', description: 'Must be rejected.', incident_time: now,
  } });
  assert.equal(unrelatedSite.response.status, 404);

  const second = await api('POST', '/api/incidents', { token: fixtures.adminToken, body: {
    site_id: fixtures.site.two.id.toString(), incident_title: `P6 ${runId} admin report`,
    description: 'Second site fixture incident.', severity: 'LOW', incident_time: now,
  } });
  assert.equal(second.response.status, 201);
  const secondId = BigInt(second.body.incident.id);
  ids.incidents.push(secondId);
  fixtures.incident.admin = secondId;

  for (const token of [fixtures.superAdminToken, fixtures.adminToken]) {
    const list = await api('GET', '/api/incidents', { token });
    assert.equal(list.response.status, 200);
    assert.ok(list.body.incidents.some((row) => row.id === guardIncidentId.toString()));
    assert.ok(list.body.incidents.some((row) => row.id === secondId.toString()));
  }
  const supervisorList = await api('GET', '/api/incidents', { token: fixtures.supervisorOneToken });
  assert.equal(supervisorList.response.status, 200);
  assert.deepEqual(supervisorList.body.incidents.map((row) => row.id), [guardIncidentId.toString()]);
  const guardList = await api('GET', '/api/incidents', { token: fixtures.guardOneToken });
  assert.deepEqual(guardList.body.incidents.map((row) => row.id), [guardIncidentId.toString()]);
  const clientList = await api('GET', '/api/incidents', { token: fixtures.clientOneToken });
  assert.equal(clientList.response.status, 200);
  assert.deepEqual(clientList.body.incidents.map((row) => row.id), [guardIncidentId.toString()]);
  const guardTwoDetails = await api('GET', `/api/incidents/${guardIncidentId}`, { token: fixtures.guardTwoToken });
  assert.equal(guardTwoDetails.response.status, 404);
  const details = await api('GET', `/api/incidents/${guardIncidentId}`, { token: fixtures.guardOneToken });
  assert.equal(details.response.status, 200);
  assert.equal(details.body.incident.site.id, fixtures.site.one.id.toString());
  assert.equal(details.body.incident.reporter.id, fixtures.user.guardOneUser.id.toString());
  assert.ok(details.body.incident.history.some((row) => row.action === 'INCIDENT_REPORTED'));
  assert.equal((await api('GET', '/api/incidents/nope')).response.status, 400);

  // Exercise the actual MySQL foreign key with a signed-64-bit-compatible missing parent ID.
  await assert.rejects(prisma.incidents.create({ data: {
    site_id: 9_223_372_036_854_775_807n, reported_by: fixtures.user.admin.id,
    incident_title: 'FK probe', description: 'Expected FK rejection.', incident_time: new Date(),
  } }), (error) => error?.code === 'P2003');
});

test('live incident updates, status transitions, and audit transactions persist correctly', { concurrency: false }, async () => {
  const id = fixtures.incident.guard;
  const forbiddenUpdate = await api('PATCH', `/api/incidents/${id}`, { token: fixtures.guardOneToken, body: { incident_title: 'Guard edit' } });
  assert.equal(forbiddenUpdate.response.status, 403);
  const outOfScopeUpdate = await api('PATCH', `/api/incidents/${fixtures.incident.admin}`, { token: fixtures.supervisorOneToken, body: { incident_title: 'Cross site edit' } });
  assert.equal(outOfScopeUpdate.response.status, 404);

  const updated = await api('PATCH', `/api/incidents/${id}`, { token: fixtures.adminToken, body: { incident_title: `P6 ${runId} updated title` } });
  assert.equal(updated.response.status, 200);
  assert.equal((await prisma.incidents.findUnique({ where: { id } })).incident_title, `P6 ${runId} updated title`);
  const invalidStatus = await api('PATCH', `/api/incidents/${id}/status`, { token: fixtures.adminToken, body: { status: 'ARCHIVED' } });
  assert.equal(invalidStatus.response.status, 400);
  const unauthorizedStatus = await api('PATCH', `/api/incidents/${id}/status`, { token: fixtures.clientOneToken, body: { status: 'INVESTIGATING' } });
  assert.equal(unauthorizedStatus.response.status, 403);
  const wrongScopeStatus = await api('PATCH', `/api/incidents/${fixtures.incident.admin}/status`, { token: fixtures.supervisorOneToken, body: { status: 'INVESTIGATING' } });
  assert.equal(wrongScopeStatus.response.status, 404);
  const skipped = await api('PATCH', `/api/incidents/${id}/status`, { token: fixtures.adminToken, body: { status: 'CLOSED' } });
  assert.equal(skipped.response.status, 409);

  const investigating = await api('PATCH', `/api/incidents/${id}/status`, { token: fixtures.supervisorOneToken, body: { status: 'INVESTIGATING' } });
  assert.equal(investigating.response.status, 200);
  const resolved = await api('PATCH', `/api/incidents/${id}/status`, { token: fixtures.adminToken, body: { status: 'RESOLVED' } });
  assert.equal(resolved.response.status, 200);
  const closed = await api('PATCH', `/api/incidents/${id}/status`, { token: fixtures.adminToken, body: { status: 'CLOSED' } });
  assert.equal(closed.response.status, 200);
  const row = await prisma.incidents.findUnique({ where: { id } });
  assert.equal(row.status, 'CLOSED');
  const audit = await prisma.audit_logs.findMany({ where: { entity_type: 'INCIDENT', entity_id: id }, orderBy: { id: 'asc' } });
  assert.ok(audit.some((entry) => entry.action === 'INCIDENT_REPORTED'));
  assert.ok(audit.some((entry) => entry.action === 'INCIDENT_UPDATED'));
  assert.equal(audit.filter((entry) => entry.action === 'INCIDENT_STATUS_CHANGED').length, 3);

  // Inject only the audit insert failure; all other work remains inside a real MySQL transaction.
  const originalTransaction = prisma.$transaction;
  prisma.$transaction = function (callback, ...options) {
    return originalTransaction.call(prisma, (tx) => callback(new Proxy(tx, {
      get(target, property) {
        const value = Reflect.get(target, property, target);
        if (property === 'audit_logs') return new Proxy(value, {
          get(delegate, method) {
            if (method === 'create') return async () => { throw new Error('Injected audit failure for rollback verification.'); };
            const member = Reflect.get(delegate, method, delegate);
            return typeof member === 'function' ? member.bind(delegate) : member;
          },
        });
        return typeof value === 'function' ? value.bind(target) : value;
      },
    })), ...options);
  };
  try {
    const previousTitle = row.incident_title;
    const failedUpdate = await api('PATCH', `/api/incidents/${id}`, { token: fixtures.adminToken, body: { incident_title: 'Must roll back' } });
    assert.equal(failedUpdate.response.status, 500);
    assert.equal((await prisma.incidents.findUnique({ where: { id } })).incident_title, previousTitle);

    const failedCreateTitle = `P6 ${runId} rolled back create`;
    const failedCreate = await api('POST', '/api/incidents', { token: fixtures.adminToken, body: {
      site_id: fixtures.site.one.id.toString(), incident_title: failedCreateTitle,
      description: 'The incident row must roll back with its audit insert.', incident_time: new Date().toISOString(),
    } });
    assert.equal(failedCreate.response.status, 500);
    assert.equal(await prisma.incidents.count({ where: { incident_title: failedCreateTitle, reported_by: fixtures.user.admin.id } }), 0);
  } finally {
    prisma.$transaction = originalTransaction;
  }
});

test('live document metadata follows role and ownership rules without exposing storage references', { concurrency: false }, async () => {
  const documents = await prisma.$transaction(async (tx) => Promise.all([
    tx.documents.create({ data: {
      guard_id: fixtures.guard.one.id, document_type: 'Identity',
      file_url: `secureguard-test://${runId}/private/guard-one`, verification_status: 'PENDING',
    } }),
    tx.documents.create({ data: {
      guard_id: fixtures.guard.two.id, document_type: 'Training',
      file_url: `secureguard-test://${runId}/private/guard-two`, verification_status: 'VERIFIED',
    } }),
  ]));
  ids.documents.push(...documents.map((row) => row.id));
  fixtures.document = { one: documents[0], two: documents[1] };

  const adminList = await api('GET', '/api/documents', { token: fixtures.adminToken });
  assert.equal(adminList.response.status, 200);
  assert.ok(adminList.body.documents.some((row) => row.id === documents[0].id.toString()));
  assert.ok(adminList.body.documents.some((row) => row.id === documents[1].id.toString()));
  assert.equal(JSON.stringify(adminList.body).includes(`secureguard-test://${runId}`), false);
  assert.ok(adminList.body.documents.every((row) => !Object.hasOwn(row, 'file_url')));

  const guardList = await api('GET', '/api/documents', { token: fixtures.guardOneToken });
  assert.equal(guardList.response.status, 200);
  assert.deepEqual(guardList.body.documents.map((row) => row.id), [documents[0].id.toString()]);
  const otherGuardDetail = await api('GET', `/api/documents/${documents[0].id}`, { token: fixtures.guardTwoToken });
  assert.equal(otherGuardDetail.response.status, 404);
  const ownDetail = await api('GET', `/api/documents/${documents[0].id}`, { token: fixtures.guardOneToken });
  assert.equal(ownDetail.response.status, 200);
  assert.equal(Object.hasOwn(ownDetail.body.document, 'file_url'), false);
  const supervisorList = await api('GET', '/api/documents', { token: fixtures.supervisorOneToken });
  assert.equal(supervisorList.response.status, 200);
  assert.deepEqual(supervisorList.body.documents.map((row) => row.id), [documents[0].id.toString()]);
  assert.equal((await api('GET', '/api/documents', { token: fixtures.clientOneToken })).response.status, 403);
  assert.equal((await api('GET', `/api/documents/${documents[1].id}`, { token: fixtures.guardOneToken })).response.status, 404);

  const updated = await api('PATCH', `/api/documents/${documents[0].id}`, { token: fixtures.adminToken, body: { document_type: 'Government ID' } });
  assert.equal(updated.response.status, 200);
  assert.equal(updated.body.document.document_type, 'Government ID');
  assert.equal((await prisma.documents.findUnique({ where: { id: documents[0].id } })).document_type, 'Government ID');
  assert.equal((await api('PATCH', `/api/documents/${documents[0].id}`, { token: fixtures.guardOneToken, body: { document_type: 'Changed by guard' } })).response.status, 403);
  assert.equal((await api('PATCH', `/api/documents/${documents[0].id}`, { token: fixtures.adminToken, body: { document_type: 'x'.repeat(51) } })).response.status, 400);
  assert.equal((await api('PATCH', `/api/documents/${documents[0].id}`, { token: fixtures.adminToken, body: { verification_status: 'VERIFIED' } })).response.status, 400);
  assert.ok((await prisma.audit_logs.findMany({ where: { entity_type: 'DOCUMENT', entity_id: documents[0].id } })).some((row) => row.action === 'DOCUMENT_METADATA_UPDATED'));

  assert.equal((await api('GET', '/api/documents?expiry=expired', { token: fixtures.adminToken })).response.status, 400);
  assert.equal((await api('GET', '/api/documents?expiringWithinDays=30', { token: fixtures.adminToken })).response.status, 400);
  const beforeUpload = await prisma.documents.count({ where: { id: { in: documents.map((row) => row.id) } } });
  const upload = await api('POST', '/api/documents/upload', { token: fixtures.adminToken, body: { guard_id: fixtures.guard.one.id.toString() } });
  assert.equal(upload.response.status, 503);
  const download = await api('GET', `/api/documents/${documents[0].id}/download`, { token: fixtures.adminToken });
  assert.equal(download.response.status, 503);
  assert.equal(JSON.stringify(download.body).includes(`secureguard-test://${runId}`), false);
  assert.equal(await prisma.documents.count({ where: { id: { in: documents.map((row) => row.id) } } }), beforeUpload);
});
