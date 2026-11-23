import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import { randomBytes, randomUUID } from 'node:crypto';
import { bootstrapIntegrationTest } from './integration-test-bootstrap.js';

// The disposable URL is validated before the application or Prisma is imported.
const { app, prisma, bcrypt } = await bootstrapIntegrationTest(process.env.SECUREGUARD_TEST_DATABASE_URL);

const runId = randomUUID().replaceAll('-', '').slice(0, 16).toUpperCase();
const emailPrefix = `sgp4-${runId.toLowerCase()}`;
const shiftPrefix = `P4${runId.slice(0, 8)}-`;
const sitePrefix = `P4 ${runId} `;
const fixtureEmails = new Set();
const fixtureUsers = new Map();
const fixtureProfiles = { guards: new Map(), supervisors: new Map(), clients: new Map() };
const fixtureSites = new Map();
const fixtureShifts = new Map();
const fixtureAssignments = new Set();
const password = `SgP4-${randomBytes(18).toString('base64url')}!9a`;
const today = new Date().toISOString().slice(0, 10);
const tomorrow = addDays(today, 1);
let rootId;
let rootToken;
let supervisorToken;
let server;
let prismaConnected = false;
let forwardedIp = 1;

function addDays(value, amount) {
  const date = new Date(`${value}T00:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() + amount);
  return date.toISOString().slice(0, 10);
}

function dateValue(value) { return new Date(`${value}T00:00:00.000Z`); }
function email(label) {
  const value = `${emailPrefix}-${label}@example.test`;
  fixtureEmails.add(value);
  return value;
}
function employeeCode(label) { return `P4${runId.slice(0, 8)}-${label}`; }
function shiftName(label) { return `${shiftPrefix}${label}`; }
function siteName(label) { return `${sitePrefix}${label}`; }

async function api(method, path, { token = rootToken, body } = {}) {
  const n = forwardedIp++;
  const response = await fetch(`http://127.0.0.1:${server.address().port}${path}`, {
    method,
    headers: {
      'content-type': 'application/json',
      'x-forwarded-for': `198.51.${Math.floor(n / 250) % 250}.${(n % 250) + 1}`,
      ...(token ? { authorization: `Bearer ${token}` } : {}),
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  return { response, body: await response.json() };
}

async function login(address) {
  const result = await api('POST', '/api/auth/login', { token: null, body: { email: address, password } });
  assert.equal(result.response.status, 200, `login failed for fixture ${address}`);
  return result.body.token;
}

async function createShift(label, start, end) {
  const result = await api('POST', '/api/shifts', {
    body: { shift_name: shiftName(label), start_time: start, end_time: end, description: 'Phase 4 live integration fixture' },
  });
  if (result.response.status === 201 && result.body.shift?.id) fixtureShifts.set(label, BigInt(result.body.shift.id));
  assert.equal(result.response.status, 201, `shift creation failed (${label}): ${JSON.stringify(result.body)}`);
  return result.body.shift;
}

async function createAssignment({ guard, site, shift, start = today, end = start }) {
  const result = await api('POST', '/api/assignments', {
    body: { guard_id: guard.id.toString(), site_id: site.id.toString(), shift_id: shift.id, start_date: start, end_date: end },
  });
  if (result.response.status === 201 && result.body.assignment?.id) fixtureAssignments.add(BigInt(result.body.assignment.id));
  return result;
}

async function createUser(tx, label, role, { isActive = true } = {}) {
  const address = email(label);
  const user = await tx.users.create({
    data: {
      name: `Phase 4 ${label}`,
      email: address,
      password_hash: await bcrypt.hash(password, 4),
      role,
      is_active: isActive,
    },
    select: { id: true, email: true },
  });
  fixtureUsers.set(label, user.id);
  return user;
}

async function createProvisionedActiveGuard() {
  const address = email('guard-day');
  const result = await api('POST', '/api/accounts', {
    body: {
      name: 'Phase 4 Provisioned Active Guard',
      email: address,
      password,
      role: 'GUARD',
      profile: {
        employee_code: employeeCode('GDAY'),
        joining_date: today,
        base_salary: '25000.00',
      },
    },
  });
  assert.equal(result.response.status, 201, `active guard provisioning failed: ${JSON.stringify(result.body)}`);
  const userId = BigInt(result.body.user.id);
  fixtureUsers.set('guard-day', userId);
  const profile = await prisma.guards.findUnique({
    where: { user_id: userId },
    include: { users: { select: { id: true, role: true, is_active: true } } },
  });
  assert.ok(profile, 'provisioning must create the related guard profile');
  assert.equal(profile.users.id, userId);
  assert.equal(profile.users.role, 'GUARD');
  assert.equal(profile.users.is_active, true);
  assert.equal(profile.employment_status, 'ACTIVE');
  fixtureProfiles.guards.set('day', profile);
}

async function assertInnoDbTables() {
  const rows = await prisma.$queryRaw`
    SELECT TABLE_NAME AS table_name, ENGINE AS engine
    FROM information_schema.TABLES
    WHERE TABLE_SCHEMA = DATABASE()
      AND TABLE_NAME IN ('users', 'guards', 'sites', 'shifts', 'assignments')
  `;
  const engines = new Map(rows.map((row) => [String(row.table_name).toLowerCase(), String(row.engine).toLowerCase()]));
  for (const name of ['users', 'guards', 'sites', 'shifts', 'assignments']) {
    assert.equal(engines.get(name), 'innodb', `${name} must use InnoDB for the locking test`);
  }
}

async function createFixtures() {
  const passwordHash = await bcrypt.hash(password, 4);
  await prisma.$transaction(async (tx) => {
    const root = await tx.users.create({ data: {
      name: 'Phase 4 Integration Admin', email: email('root'), password_hash: passwordHash,
      role: 'SUPER_ADMIN', is_active: true,
    }, select: { id: true } });
    rootId = root.id;
    fixtureUsers.set('root', root.id);

    const supervisorOne = await createUser(tx, 'supervisor-one', 'SUPERVISOR');
    const supervisorOneProfile = await tx.supervisors.create({ data: {
      user_id: supervisorOne.id, employee_code: employeeCode('SUP1'), joining_date: dateValue(today), status: 'ACTIVE',
    } });
    fixtureProfiles.supervisors.set('one', supervisorOneProfile.id);

    const supervisorTwo = await createUser(tx, 'supervisor-two', 'SUPERVISOR');
    const supervisorTwoProfile = await tx.supervisors.create({ data: {
      user_id: supervisorTwo.id, employee_code: employeeCode('SUP2'), joining_date: dateValue(today), status: 'ACTIVE',
    } });
    fixtureProfiles.supervisors.set('two', supervisorTwoProfile.id);

    const clientUser = await createUser(tx, 'client', 'CLIENT');
    const client = await tx.clients.create({ data: {
      user_id: clientUser.id, company_name: `Phase 4 ${runId} Client`, status: 'ACTIVE',
    } });
    fixtureProfiles.clients.set('client', client.id);

    for (const [label, status, isActive] of [
      ['night', 'ACTIVE'], ['cross', 'ACTIVE'], ['history', 'ACTIVE'],
      ['scope-one', 'ACTIVE'], ['scope-two', 'ACTIVE'], ['race', 'ACTIVE'], ['inactive', 'INACTIVE'],
      ['on-leave', 'ON_LEAVE', true], ['terminated', 'TERMINATED', true], ['disabled', 'ACTIVE', false],
    ]) {
      const guardUser = await createUser(tx, `guard-${label}`, 'GUARD', { isActive });
      const guard = await tx.guards.create({ data: {
        user_id: guardUser.id,
        employee_code: employeeCode(`G${label.replaceAll('-', '').slice(0, 7).toUpperCase()}`),
        joining_date: dateValue(today), base_salary: '25000.00', employment_status: status,
      } });
      fixtureProfiles.guards.set(label, guard);
    }

    for (const [label, supervisorId, status] of [
      ['one', supervisorOneProfile.id, 'ACTIVE'],
      ['two', supervisorTwoProfile.id, 'ACTIVE'],
      ['inactive', supervisorOneProfile.id, 'INACTIVE'],
    ]) {
      const site = await tx.sites.create({ data: {
        client_id: client.id, supervisor_id: supervisorId, site_name: siteName(label),
        address: `Phase 4 integration site ${label}`, required_guards: 1, status,
      } });
      fixtureSites.set(label, site);
    }
  });
}

async function cleanupFixtures() {
  if (!prismaConnected || fixtureEmails.size === 0) return;
  await prisma.$transaction(async (tx) => {
    const users = await tx.users.findMany({
      where: { email: { in: [...fixtureEmails] } }, select: { id: true },
    });
    const userIds = users.map((row) => row.id);
    if (userIds.length === 0) return;

    const guardRows = await tx.guards.findMany({ where: { user_id: { in: userIds } }, select: { id: true } });
    const guardIds = guardRows.map((row) => row.id);
    const shiftRows = await tx.shifts.findMany({
      where: { shift_name: { startsWith: shiftPrefix } }, select: { id: true },
    });
    const shiftIds = shiftRows.map((row) => row.id);
    const siteIds = [...fixtureSites.values()].map((row) => row.id);
    const assignments = await tx.assignments.findMany({
      where: {
        assigned_by: { in: userIds },
        ...(guardIds.length ? { guard_id: { in: guardIds } } : {}),
        ...(siteIds.length ? { site_id: { in: siteIds } } : {}),
        ...(shiftIds.length ? { shift_id: { in: shiftIds } } : {}),
      },
      select: { id: true },
    });
    const assignmentIds = assignments.map((row) => row.id);

    if (assignmentIds.length) {
      await tx.attendance.deleteMany({ where: { assignment_id: { in: assignmentIds } } });
      await tx.assignments.deleteMany({ where: { id: { in: assignmentIds } } });
    }
    await tx.audit_logs.deleteMany({ where: { user_id: { in: userIds } } });
    if (shiftIds.length) await tx.shifts.deleteMany({ where: { id: { in: shiftIds } } });
    if (siteIds.length) await tx.sites.deleteMany({ where: { id: { in: siteIds } } });
    await tx.guards.deleteMany({ where: { user_id: { in: userIds } } });
    await tx.supervisors.deleteMany({ where: { user_id: { in: userIds } } });
    await tx.clients.deleteMany({ where: { user_id: { in: userIds } } });
    await tx.users.deleteMany({ where: { id: { in: userIds } } });
  });
}

before(async () => {
  await prisma.$connect();
  prismaConnected = true;
  await assertInnoDbTables();

  app.set('trust proxy', 'loopback');
  server = app.listen(0, '127.0.0.1');
  await new Promise((resolve, reject) => {
    server.once('listening', resolve);
    server.once('error', reject);
  });

  await createFixtures();
  rootToken = await login(email('root'));
  await createProvisionedActiveGuard();
  supervisorToken = await login(email('supervisor-one'));
});

after(async () => {
  try {
    if (server?.listening) await new Promise((resolve) => server.close(resolve));
    await cleanupFixtures();
  } finally {
    await prisma.$disconnect();
  }
});

test('live shift creation, validation, updates, and assignment-based status restrictions', { concurrency: false }, async () => {
  const badTime = await api('POST', '/api/shifts', { body: { shift_name: shiftName('bad'), start_time: '25:00', end_time: '06:00' } });
  assert.equal(badTime.response.status, 400);
  const zeroLength = await api('POST', '/api/shifts', { body: { shift_name: shiftName('zero'), start_time: '08:00', end_time: '08:00' } });
  assert.equal(zeroLength.response.status, 400);

  const daytime = await createShift('day', '08:00', '16:00');
  const evening = await createShift('evening', '16:00', '22:00');
  const afternoon = await createShift('afternoon', '14:00', '22:00');
  const overnight = await createShift('overnight', '22:00', '06:00');
  const early = await createShift('early', '02:00', '10:00');
  const cross = await createShift('cross', '22:00', '02:00');
  const crossEarly = await createShift('cross-early', '01:00', '05:00');
  const inactive = await createShift('inactive', '09:00', '17:00');
  const siteInactive = fixtureSites.get('inactive');

  const details = await api('GET', `/api/shifts/${daytime.id}`);
  assert.equal(details.response.status, 200);
  assert.equal(details.body.shift.start_time, '08:00:00');
  const update = await api('PUT', `/api/shifts/${daytime.id}`, { body: { description: 'Updated by Phase 4 integration test' } });
  assert.equal(update.response.status, 200);
  assert.equal(update.body.shift.description, 'Updated by Phase 4 integration test');

  const deactivateUnused = await api('PATCH', `/api/shifts/${inactive.id}/status`, { body: { is_active: false } });
  assert.equal(deactivateUnused.response.status, 200);
  const eligibleGuard = fixtureProfiles.guards.get('day');
  const rejectedShift = await createAssignment({ guard: eligibleGuard, site: fixtureSites.get('one'), shift: inactive });
  assert.equal(rejectedShift.response.status, 400);

  const inactiveSiteAssignment = await createAssignment({ guard: eligibleGuard, site: siteInactive, shift: daytime });
  assert.equal(inactiveSiteAssignment.response.status, 400);

  assert.equal(evening.is_active, true);
  assert.equal(afternoon.is_active, true);
  assert.equal(overnight.is_active, true);
  assert.equal(early.is_active, true);
  assert.equal(cross.is_active, true);
  assert.equal(crossEarly.is_active, true);
});

test('live allocations enforce eligibility, overlaps, adjacent shifts, edits, and history', { concurrency: false }, async () => {
  const guard = fixtureProfiles.guards.get('day');
  const site = fixtureSites.get('one');
  const dayShift = { id: fixtureShifts.get('day').toString() };
  const eveningShift = { id: fixtureShifts.get('evening').toString() };
  const afternoonShift = { id: fixtureShifts.get('afternoon').toString() };
  for (const label of ['inactive', 'on-leave', 'terminated', 'disabled']) {
    const rejected = await createAssignment({ guard: fixtureProfiles.guards.get(label), site, shift: dayShift });
    assert.equal(rejected.response.status, 400, `${label} guard must remain ineligible`);
  }

  const first = await createAssignment({ guard, site, shift: dayShift });
  assert.equal(first.response.status, 201, JSON.stringify(first.body));
  fixtureAssignments.add(BigInt(first.body.assignment.id));

  const daytimeOverlap = await createAssignment({ guard, site: fixtureSites.get('two'), shift: afternoonShift });
  assert.equal(daytimeOverlap.response.status, 409);
  const adjacent = await createAssignment({ guard, site, shift: eveningShift });
  assert.equal(adjacent.response.status, 201, JSON.stringify(adjacent.body));
  fixtureAssignments.add(BigInt(adjacent.body.assignment.id));

  const updateConflict = await api('PUT', `/api/assignments/${adjacent.body.assignment.id}`, {
    body: { shift_id: afternoonShift.id },
  });
  assert.equal(updateConflict.response.status, 409);

  const shiftTimeUpdate = await api('PUT', `/api/shifts/${dayShift.id}`, { body: { start_time: '08:30' } });
  assert.equal(shiftTimeUpdate.response.status, 409);
  const shiftDeactivate = await api('PATCH', `/api/shifts/${dayShift.id}/status`, { body: { is_active: false } });
  assert.equal(shiftDeactivate.response.status, 409);

  const historyGuard = fixtureProfiles.guards.get('history');
  const history = await createAssignment({ guard: historyGuard, site, shift: dayShift });
  assert.equal(history.response.status, 201, JSON.stringify(history.body));
  fixtureAssignments.add(BigInt(history.body.assignment.id));

  const edit = await api('PUT', `/api/assignments/${history.body.assignment.id}`, {
    body: { shift_id: eveningShift.id, site_id: fixtureSites.get('two').id.toString() },
  });
  assert.equal(edit.response.status, 200, JSON.stringify(edit.body));
  assert.equal(edit.body.assignment.shift.id, eveningShift.id);
  const ended = await api('PATCH', `/api/assignments/${history.body.assignment.id}/end`, { body: { end_date: today } });
  assert.equal(ended.response.status, 200, JSON.stringify(ended.body));
  assert.equal(ended.body.assignment.status, 'COMPLETED');
  const preserved = await prisma.assignments.findUnique({ where: { id: BigInt(history.body.assignment.id) } });
  assert.ok(preserved, 'ending an assignment must preserve its database row');
  assert.equal(preserved.status, 'COMPLETED');

  const siteDeactivate = await api('PATCH', `/api/sites/${site.id}/status`, { body: { status: 'INACTIVE' } });
  assert.equal(siteDeactivate.response.status, 409);
});

test('live overnight and cross-midnight allocation conflicts are rejected', { concurrency: false }, async () => {
  const nightGuard = fixtureProfiles.guards.get('night');
  const night = { id: fixtureShifts.get('overnight').toString() };
  const early = { id: fixtureShifts.get('early').toString() };
  const nightAssignment = await createAssignment({ guard: nightGuard, site: fixtureSites.get('one'), shift: night });
  assert.equal(nightAssignment.response.status, 201, JSON.stringify(nightAssignment.body));
  fixtureAssignments.add(BigInt(nightAssignment.body.assignment.id));

  const nextMorning = await createAssignment({ guard: nightGuard, site: fixtureSites.get('one'), shift: early, start: tomorrow, end: tomorrow });
  assert.equal(nextMorning.response.status, 409);

  const crossGuard = fixtureProfiles.guards.get('cross');
  const cross = { id: fixtureShifts.get('cross').toString() };
  const crossEarly = { id: fixtureShifts.get('cross-early').toString() };
  const spanning = await createAssignment({ guard: crossGuard, site: fixtureSites.get('one'), shift: cross, start: today, end: tomorrow });
  assert.equal(spanning.response.status, 201, JSON.stringify(spanning.body));
  fixtureAssignments.add(BigInt(spanning.body.assignment.id));
  const secondDateOverlap = await createAssignment({ guard: crossGuard, site: fixtureSites.get('two'), shift: crossEarly, start: tomorrow, end: tomorrow });
  assert.equal(secondDateOverlap.response.status, 409);
});

test('live supervisor assignment visibility is limited to the supervisor’s sites', { concurrency: false }, async () => {
  const visible = await createAssignment({ guard: fixtureProfiles.guards.get('scope-one'), site: fixtureSites.get('one'), shift: { id: fixtureShifts.get('day').toString() } });
  assert.equal(visible.response.status, 201, JSON.stringify(visible.body));
  fixtureAssignments.add(BigInt(visible.body.assignment.id));
  const hidden = await createAssignment({ guard: fixtureProfiles.guards.get('scope-two'), site: fixtureSites.get('two'), shift: { id: fixtureShifts.get('day').toString() } });
  assert.equal(hidden.response.status, 201, JSON.stringify(hidden.body));
  fixtureAssignments.add(BigInt(hidden.body.assignment.id));

  const list = await api('GET', '/api/assignments', { token: supervisorToken });
  assert.equal(list.response.status, 200);
  assert.ok(list.body.assignments.every((row) => row.site.id === fixtureSites.get('one').id.toString()));
  const outsideDetail = await api('GET', `/api/assignments/${hidden.body.assignment.id}`, { token: supervisorToken });
  assert.equal(outsideDetail.response.status, 404);
});

test('simultaneous live allocations serialize and MySQL retains at most one conflicting active row', { concurrency: false }, async () => {
  const guard = fixtureProfiles.guards.get('race');
  const dayShift = { id: fixtureShifts.get('day').toString() };
  const afternoonShift = { id: fixtureShifts.get('afternoon').toString() };
  const [first, second] = await Promise.all([
    createAssignment({ guard, site: fixtureSites.get('one'), shift: dayShift }),
    createAssignment({ guard, site: fixtureSites.get('two'), shift: afternoonShift }),
  ]);

  for (const result of [first, second]) {
    if (result.response.status === 201 && result.body.assignment?.id) fixtureAssignments.add(BigInt(result.body.assignment.id));
  }
  // This is a direct Prisma/MySQL read after both HTTP requests have settled.
  const committed = await prisma.assignments.findMany({
    where: {
      guard_id: guard.id,
      status: 'ACTIVE',
      start_date: { lte: dateValue(today) },
      OR: [{ end_date: null }, { end_date: { gte: dateValue(today) } }],
    },
    select: { id: true, site_id: true, shift_id: true, start_date: true, end_date: true },
  });
  assert.ok(committed.length <= 1, 'the isolated race-test guard must have at most one conflicting active row');
  assert.deepEqual([first.response.status, second.response.status].sort(), [201, 409]);
});

test('live audit entries record shift and assignment actions without deleting history', { concurrency: false }, async () => {
  const audit = await prisma.audit_logs.findMany({
    where: { user_id: rootId },
    select: { action: true, entity_type: true, entity_id: true },
  });
  const entries = new Set(audit.map((row) => `${row.entity_type}:${row.action}`));
  for (const action of ['SHIFT_CREATED', 'SHIFT_UPDATED', 'SHIFT_STATUS_CHANGED']) {
    assert.ok(entries.has(`SHIFT:${action}`), `missing ${action} audit entry`);
  }
  for (const action of ['ASSIGNMENT_CREATED', 'ASSIGNMENT_UPDATED', 'ASSIGNMENT_ENDED']) {
    assert.ok(entries.has(`ASSIGNMENT:${action}`), `missing ${action} audit entry`);
  }

  const ended = await prisma.assignments.findMany({
    where: { id: { in: [...fixtureAssignments] }, status: 'COMPLETED' },
    select: { id: true, status: true },
  });
  assert.ok(ended.length >= 1, 'completed assignment history must remain queryable');
});
