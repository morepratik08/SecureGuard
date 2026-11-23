import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import { randomBytes, randomUUID } from 'node:crypto';
import { bootstrapIntegrationTest } from './integration-test-bootstrap.js';

// The dedicated disposable URL is validated before importing Prisma or Express.
const { app, prisma, bcrypt } = await bootstrapIntegrationTest(process.env.SECUREGUARD_TEST_DATABASE_URL);

const runId = randomUUID().replaceAll('-', '').slice(0, 16).toUpperCase();
const emailPrefix = `sgp5-${runId.toLowerCase()}`;
const codePrefix = `P5${runId.slice(0, 8)}-`;
const sitePrefix = `P5 ${runId} `;
const shiftPrefix = `P5${runId.slice(0, 8)}-`;
const fixtureEmails = new Set();
const fixtureUsers = new Map();
const fixtureGuards = new Map();
const fixtureSupervisors = new Map();
const fixtureClients = new Map();
const fixtureSites = new Map();
const fixtureShifts = new Map();
let rootId;
let rootToken;
let supervisorOneToken;
let supervisorTwoToken;
let mainGuardToken;
let otherGuardToken;
let leaveGuardToken;
let otherLeaveGuardToken;
let approvalGuardToken;
let rejectionGuardToken;
let activeLeaveGuardToken;
let server;
let connected = false;
let forwarded = 1;
const password = `Phase5-${randomBytes(18).toString('base64url')}!9a`;

function email(label) {
  const value = `${emailPrefix}-${label}@example.test`;
  fixtureEmails.add(value);
  return value;
}
function dateOnly(value) { return new Date(`${value}T00:00:00.000Z`); }
function day(value, offset) {
  const date = dateOnly(value); date.setUTCDate(date.getUTCDate() + offset); return date.toISOString().slice(0, 10);
}
function nowDate() { return new Date().toISOString().slice(0, 10); }
function timeString(minutesFromNow) {
  const date = new Date();
  date.setUTCMinutes(date.getUTCMinutes() + minutesFromNow, 0, 0);
  return date.toISOString().slice(11, 19);
}

async function api(method, path, { token = rootToken, body } = {}) {
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

async function login(label) {
  const result = await api('POST', '/api/auth/login', { token: null, body: { email: email(label), password } });
  assert.equal(result.response.status, 200, `fixture login failed for ${label}`);
  return result.body.token;
}

async function createUser(tx, label, role) {
  const row = await tx.users.create({
    data: {
      name: `Phase 5 ${label}`, email: email(label), password_hash: await bcrypt.hash(password, 4),
      role, is_active: true,
    },
    select: { id: true },
  });
  fixtureUsers.set(label, row.id);
  return row.id;
}

async function createFixtures() {
  const code = (label) => `${codePrefix}${label}`;
  await prisma.$transaction(async (tx) => {
    rootId = await createUser(tx, 'admin', 'SUPER_ADMIN');
    const supervisorOneUserId = await createUser(tx, 'supervisor-one', 'SUPERVISOR');
    const supervisorOne = await tx.supervisors.create({ data: { user_id: supervisorOneUserId, employee_code: code('SUP1'), joining_date: dateOnly(nowDate()), status: 'ACTIVE' } });
    fixtureSupervisors.set('one', supervisorOne);
    const supervisorTwoUserId = await createUser(tx, 'supervisor-two', 'SUPERVISOR');
    const supervisorTwo = await tx.supervisors.create({ data: { user_id: supervisorTwoUserId, employee_code: code('SUP2'), joining_date: dateOnly(nowDate()), status: 'ACTIVE' } });
    fixtureSupervisors.set('two', supervisorTwo);

    const clientUserId = await createUser(tx, 'client', 'CLIENT');
    const client = await tx.clients.create({ data: { user_id: clientUserId, company_name: `Phase 5 ${runId} Client`, status: 'ACTIVE' } });
    fixtureClients.set('client', client);

    const siteOne = await tx.sites.create({ data: {
      client_id: client.id, supervisor_id: supervisorOne.id, site_name: `${sitePrefix}One`, address: 'Phase 5 fixture site one', status: 'ACTIVE', required_guards: 1,
    } });
    const siteTwo = await tx.sites.create({ data: {
      client_id: client.id, supervisor_id: supervisorTwo.id, site_name: `${sitePrefix}Two`, address: 'Phase 5 fixture site two', status: 'ACTIVE', required_guards: 1,
    } });
    fixtureSites.set('one', siteOne); fixtureSites.set('two', siteTwo);

    for (const label of ['main', 'other', 'leave-one', 'leave-two', 'approval', 'rejection', 'active-leave', 'absence', 'manual']) {
      const userId = await createUser(tx, `guard-${label}`, 'GUARD');
      const profile = await tx.guards.create({ data: {
        user_id: userId, employee_code: code(`G${label.replaceAll('-', '').slice(0, 8).toUpperCase()}`),
        joining_date: dateOnly(nowDate()), base_salary: '25000.00', employment_status: 'ACTIVE',
      } });
      fixtureGuards.set(label, profile);
    }
  });
}

async function createShift(label, start, end) {
  const shift = await prisma.shifts.create({ data: {
    shift_name: `${shiftPrefix}${label}`, start_time: new Date(`1970-01-01T${start}Z`),
    end_time: new Date(`1970-01-01T${end}Z`), description: 'Phase 5 live integration fixture', is_active: true,
  } });
  fixtureShifts.set(label, shift);
  return shift;
}

async function createAssignment({ guard, site, shift, start, end }) {
  return prisma.assignments.create({ data: {
    guard_id: guard.id, site_id: site.id, shift_id: shift.id,
    assigned_by: rootId, start_date: dateOnly(start), end_date: end ? dateOnly(end) : null, status: 'ACTIVE',
  } });
}

async function cleanup() {
  if (!connected || !fixtureEmails.size) return;
  await prisma.$transaction(async (tx) => {
    const users = await tx.users.findMany({ where: { email: { in: [...fixtureEmails] } }, select: { id: true } });
    const userIds = users.map((row) => row.id);
    if (!userIds.length) return;
    const guardRows = await tx.guards.findMany({ where: { user_id: { in: userIds } }, select: { id: true } });
    const guardIds = guardRows.map((row) => row.id);
    const shiftRows = await tx.shifts.findMany({ where: { shift_name: { startsWith: shiftPrefix } }, select: { id: true } });
    const shiftIds = shiftRows.map((row) => row.id);
    const siteIds = [...fixtureSites.values()].map((row) => row.id);
    const assignments = guardIds.length ? await tx.assignments.findMany({
      where: { guard_id: { in: guardIds }, assigned_by: { in: userIds }, site_id: { in: siteIds }, shift_id: { in: shiftIds } },
      select: { id: true },
    }) : [];
    const assignmentIds = assignments.map((row) => row.id);
    if (assignmentIds.length) await tx.attendance.deleteMany({ where: { assignment_id: { in: assignmentIds } } });
    if (guardIds.length) await tx.leaves.deleteMany({ where: { guard_id: { in: guardIds } } });
    if (assignmentIds.length) await tx.assignments.deleteMany({ where: { id: { in: assignmentIds } } });
    await tx.audit_logs.deleteMany({ where: { user_id: { in: userIds } } });
    if (shiftIds.length) await tx.shifts.deleteMany({ where: { id: { in: shiftIds } } });
    if (siteIds.length) await tx.sites.deleteMany({ where: { id: { in: siteIds } } });
    await tx.guards.deleteMany({ where: { user_id: { in: userIds } } });
    await tx.supervisors.deleteMany({ where: { user_id: { in: userIds } } });
    await tx.clients.deleteMany({ where: { user_id: { in: userIds } } });
    await tx.users.deleteMany({ where: { id: { in: userIds } } });
  });
}

let currentAssignment;
let absenceAssignment;
let manualAssignment;
let mainShift;
let overnightShift;
let absenceShift;
let mainAttendanceId;
let ownLeaveId;
let approvedLeaveId;
let rejectedLeaveId;

before(async () => {
  await prisma.$connect(); connected = true;
  app.set('trust proxy', 'loopback');
  server = app.listen(0, '127.0.0.1');
  await new Promise((resolve, reject) => { server.once('listening', resolve); server.once('error', reject); });
  await createFixtures();
  rootToken = await login('admin');
  supervisorOneToken = await login('supervisor-one');
  supervisorTwoToken = await login('supervisor-two');
  mainGuardToken = await login('guard-main');
  otherGuardToken = await login('guard-other');
  leaveGuardToken = await login('guard-leave-one');
  otherLeaveGuardToken = await login('guard-leave-two');
  approvalGuardToken = await login('guard-approval');
  rejectionGuardToken = await login('guard-rejection');
  activeLeaveGuardToken = await login('guard-active-leave');

  mainShift = await createShift('main', timeString(-5), timeString(120));
  overnightShift = await createShift('overnight', '22:00:00', '06:00:00');
  absenceShift = await createShift('absence', '00:00:00', '01:00:00');
  currentAssignment = await createAssignment({ guard: fixtureGuards.get('main'), site: fixtureSites.get('one'), shift: mainShift, start: day(nowDate(), -1), end: nowDate() });
  absenceAssignment = await createAssignment({ guard: fixtureGuards.get('absence'), site: fixtureSites.get('one'), shift: absenceShift, start: day(nowDate(), -1), end: day(nowDate(), -1) });
  manualAssignment = await createAssignment({ guard: fixtureGuards.get('manual'), site: fixtureSites.get('one'), shift: absenceShift, start: day(nowDate(), -1), end: day(nowDate(), -1) });
  await prisma.attendance.create({ data: {
    assignment_id: manualAssignment.id, guard_id: manualAssignment.guard_id, site_id: manualAssignment.site_id,
    attendance_date: dateOnly(day(nowDate(), -1)), check_in: new Date(`${day(nowDate(), -1)}T00:05:00Z`),
    check_out: new Date(`${day(nowDate(), -1)}T01:00:00Z`), status: 'LATE', verified_by: fixtureSupervisors.get('one').id,
  } });

  await createAssignment({ guard: fixtureGuards.get('leave-one'), site: fixtureSites.get('one'), shift: mainShift, start: nowDate(), end: day(nowDate(), 10) });
  await createAssignment({ guard: fixtureGuards.get('leave-two'), site: fixtureSites.get('two'), shift: mainShift, start: nowDate(), end: day(nowDate(), 10) });
  await createAssignment({ guard: fixtureGuards.get('active-leave'), site: fixtureSites.get('one'), shift: mainShift, start: nowDate(), end: day(nowDate(), 10) });
});

after(async () => {
  try {
    if (server?.listening) await new Promise((resolve) => server.close(resolve));
    await cleanup();
  } finally { await prisma.$disconnect(); }
});

test('guard check-in uses owned active assignment and prevents simultaneous duplicates', { concurrency: false }, async () => {
  const unauthorized = await api('POST', '/api/attendance/check-in', { token: otherGuardToken, body: { assignment_id: currentAssignment.id.toString() } });
  assert.equal(unauthorized.response.status, 404);

  const [first, second] = await Promise.all([
    api('POST', '/api/attendance/check-in', { token: mainGuardToken, body: { assignment_id: currentAssignment.id.toString() } }),
    api('POST', '/api/attendance/check-in', { token: mainGuardToken, body: { assignment_id: currentAssignment.id.toString() } }),
  ]);
  assert.deepEqual([first.response.status, second.response.status].sort(), [201, 409]);
  const created = first.response.status === 201 ? first : second;
  mainAttendanceId = BigInt(created.body.attendance.id);
  assert.ok(['PRESENT', 'LATE'].includes(created.body.attendance.status));
  const direct = await prisma.attendance.findMany({ where: { assignment_id: currentAssignment.id, attendance_date: dateOnly(nowDate()) } });
  assert.equal(direct.length, 1, 'MySQL unique key must preserve exactly one concurrent check-in');
  const duplicate = await api('POST', '/api/attendance/check-in', { token: mainGuardToken, body: { assignment_id: currentAssignment.id.toString() } });
  assert.equal(duplicate.response.status, 409);
  const personal = await api('GET', '/api/attendance/me', { token: otherGuardToken });
  assert.equal(personal.response.status, 200);
  assert.equal(personal.body.attendance.length, 0);
});

test('check-out is one-time, calculates duration, and supervisor verification preserves timestamps', { concurrency: false }, async () => {
  const checkout = await api('PATCH', `/api/attendance/${mainAttendanceId}/check-out`, { token: mainGuardToken });
  assert.equal(checkout.response.status, 200, JSON.stringify(checkout.body));
  assert.ok(checkout.body.attendance.working_duration_minutes >= 0);
  const repeated = await api('PATCH', `/api/attendance/${mainAttendanceId}/check-out`, { token: mainGuardToken });
  assert.equal(repeated.response.status, 409);

  const beforeVerify = await prisma.attendance.findUnique({ where: { id: mainAttendanceId } });
  const verify = await api('PATCH', `/api/attendance/${mainAttendanceId}/verify`, { token: supervisorOneToken });
  assert.equal(verify.response.status, 200, JSON.stringify(verify.body));
  assert.equal(verify.body.attendance.verified, true);
  const afterVerify = await prisma.attendance.findUnique({ where: { id: mainAttendanceId } });
  assert.equal(afterVerify.check_in.getTime(), beforeVerify.check_in.getTime());
  assert.equal(afterVerify.check_out.getTime(), beforeVerify.check_out.getTime());
  const repeatedVerify = await api('PATCH', `/api/attendance/${mainAttendanceId}/verify`, { token: supervisorOneToken });
  assert.equal(repeatedVerify.response.status, 409);
  const unrelatedSupervisor = await api('PATCH', `/api/attendance/${mainAttendanceId}/verify`, { token: supervisorTwoToken });
  assert.equal(unrelatedSupervisor.response.status, 404);
});

test('absence generation waits until shift end, avoids duplicates, and preserves verified attendance', { concurrency: false }, async () => {
  const yesterday = day(nowDate(), -1);
  const early = await api('POST', '/api/attendance/absences/generate', { body: { date: yesterday } });
  assert.equal(early.response.status, 200, JSON.stringify(early.body));
  const absence = await prisma.attendance.findFirst({ where: { assignment_id: absenceAssignment.id, attendance_date: dateOnly(yesterday) } });
  assert.equal(absence.status, 'ABSENT');
  const manual = await prisma.attendance.findFirst({ where: { assignment_id: manualAssignment.id, attendance_date: dateOnly(yesterday) } });
  assert.equal(manual.status, 'LATE');
  assert.equal(manual.verified_by, fixtureSupervisors.get('one').id);
  const repeated = await api('POST', '/api/attendance/absences/generate', { body: { date: yesterday } });
  assert.equal(repeated.response.status, 200);
  assert.equal((await prisma.attendance.findMany({ where: { assignment_id: absenceAssignment.id, attendance_date: dateOnly(yesterday) } })).length, 1);
  const future = await api('POST', '/api/attendance/absences/generate', { body: { date: day(nowDate(), 1) } });
  assert.equal(future.response.status, 400);
});

test('leave application, overlap, supervisor scope, approval/rejection, and assignment restrictions work', { concurrency: false }, async () => {
  const start = day(nowDate(), 5); const end = day(nowDate(), 6);
  const submitted = await api('POST', '/api/leaves', { token: leaveGuardToken, body: { start_date: start, end_date: end, reason: 'Personal leave for integration test' } });
  assert.equal(submitted.response.status, 201, JSON.stringify(submitted.body));
  ownLeaveId = BigInt(submitted.body.leave.id);
  const overlap = await api('POST', '/api/leaves', { token: leaveGuardToken, body: { start_date: end, end_date: day(nowDate(), 7), reason: 'Overlapping request' } });
  assert.equal(overlap.response.status, 409);
  const hiddenLeave = await api('GET', `/api/leaves/${ownLeaveId}`, { token: otherLeaveGuardToken });
  assert.equal(hiddenLeave.response.status, 404);

  const leaveScope = await api('GET', '/api/leaves', { token: supervisorOneToken });
  assert.ok(leaveScope.body.leaves.some((row) => row.id === ownLeaveId.toString()));
  const unrelated = await api('POST', '/api/leaves', { token: otherLeaveGuardToken, body: { start_date: start, end_date: end, reason: 'Other site request' } });
  assert.equal(unrelated.response.status, 201, JSON.stringify(unrelated.body));
  const scopedAgain = await api('GET', '/api/leaves', { token: supervisorOneToken });
  assert.equal(scopedAgain.body.leaves.some((row) => row.id === unrelated.body.leave.id), false);

  const approvedRequest = await api('POST', '/api/leaves', { token: approvalGuardToken, body: { start_date: start, end_date: end, reason: 'Approved test leave' } });
  assert.equal(approvedRequest.response.status, 201);
  approvedLeaveId = BigInt(approvedRequest.body.leave.id);
  const approved = await api('PATCH', `/api/leaves/${approvedLeaveId}/approve`);
  assert.equal(approved.response.status, 200, JSON.stringify(approved.body));
  assert.equal(approved.body.leave.status, 'APPROVED');
  const allocationDuringLeave = await api('POST', '/api/assignments', { body: {
    guard_id: fixtureGuards.get('approval').id.toString(), site_id: fixtureSites.get('one').id.toString(),
    shift_id: mainShift.id.toString(), start_date: start, end_date: end,
  } });
  assert.equal(allocationDuringLeave.response.status, 409);
  const repeatedDecision = await api('PATCH', `/api/leaves/${approvedLeaveId}/reject`);
  assert.equal(repeatedDecision.response.status, 409);

  const overlappingActive = await api('POST', '/api/leaves', { token: activeLeaveGuardToken, body: { start_date: nowDate(), end_date: nowDate(), reason: 'Must not override assignment' } });
  assert.equal(overlappingActive.response.status, 201);
  const blockedApproval = await api('PATCH', `/api/leaves/${overlappingActive.body.leave.id}/approve`);
  assert.equal(blockedApproval.response.status, 409);

  const rejectedRequest = await api('POST', '/api/leaves', { token: rejectionGuardToken, body: { start_date: start, end_date: end, reason: 'Rejected test leave' } });
  assert.equal(rejectedRequest.response.status, 201);
  rejectedLeaveId = BigInt(rejectedRequest.body.leave.id);
  const rejected = await api('PATCH', `/api/leaves/${rejectedLeaveId}/reject`);
  assert.equal(rejected.response.status, 200);
  assert.equal(rejected.body.leave.status, 'REJECTED');
});

test('attendance and leave access is role-scoped and audits/history are queryable in MySQL', { concurrency: false }, async () => {
  const clientToken = await login('client');
  const clientAttendance = await api('GET', '/api/attendance', { token: clientToken });
  assert.equal(clientAttendance.response.status, 403);
  const clientLeaves = await api('GET', '/api/leaves', { token: clientToken });
  assert.equal(clientLeaves.response.status, 403);
  const record = await prisma.attendance.findUnique({ where: { id: mainAttendanceId } });
  assert.ok(record, 'attendance history must remain present after checkout/verification');
  assert.ok(record.check_in && record.check_out && record.verified_by);
  const leaveRows = await prisma.leaves.findMany({ where: { id: { in: [ownLeaveId, approvedLeaveId, rejectedLeaveId] } } });
  assert.equal(leaveRows.length, 3);
  assert.deepEqual(new Set(leaveRows.map((row) => row.status)), new Set(['PENDING', 'APPROVED', 'REJECTED']));
  const audit = await prisma.audit_logs.findMany({
    where: { user_id: { in: [...fixtureUsers.values()] }, entity_type: { in: ['ATTENDANCE', 'LEAVE'] } },
    select: { action: true },
  });
  const actions = new Set(audit.map((row) => row.action));
  for (const action of ['ATTENDANCE_CHECK_IN', 'ATTENDANCE_CHECK_OUT', 'ATTENDANCE_VERIFIED', 'ATTENDANCE_ABSENCE_RECORDED', 'LEAVE_REQUESTED', 'LEAVE_APPROVED', 'LEAVE_REJECTED']) {
    assert.ok(actions.has(action), `missing audit action ${action}`);
  }
});
