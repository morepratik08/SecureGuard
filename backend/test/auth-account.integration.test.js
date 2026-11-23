import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import { randomBytes, randomUUID } from 'node:crypto';
import { bootstrapIntegrationTest } from './integration-test-bootstrap.js';

// Validate and set the disposable URL before importing Prisma or any app module.
const modules = await bootstrapIntegrationTest(process.env.SECUREGUARD_TEST_DATABASE_URL);
const { app, prisma, createAccount, bcrypt } = modules;

const runId = randomUUID().replaceAll('-', '').slice(0, 20);
const emailPrefix = `sgit-${runId}`;
const createdEmails = new Set();
const createdUserIds = new Set();
const orphanGuardCodes = new Set();
const accounts = {};
const initialPassword = randomBytes(18).toString('base64url');
const changedPassword = randomBytes(18).toString('base64url');
const resetPassword = randomBytes(18).toString('base64url');
let bootstrapEmail;
let bootstrapUserId;
let rootToken;
let adminToken;
let server;
let prismaConnected = false;
let requestIpCounter = 1;

function uniqueEmail(label) {
  const email = `${emailPrefix}-${label}@example.test`.toLowerCase();
  createdEmails.add(email);
  return email;
}

function uniqueEmployeeCode(label) {
  return `SG${runId.slice(0, 10)}-${label}`.toUpperCase();
}

function nextClientIp() {
  const value = requestIpCounter++;
  const thirdOctet = Math.floor(value / 250) % 250;
  const fourthOctet = (value % 250) + 1;
  return `198.51.${thirdOctet}.${fourthOctet}`;
}

async function request(method, path, { body, token } = {}) {
  const response = await fetch(`http://127.0.0.1:${server.address().port}${path}`, {
    method,
    headers: {
      'content-type': 'application/json',
      'x-forwarded-for': nextClientIp(),
      ...(token ? { authorization: `Bearer ${token}` } : {}),
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  return { response, body: await response.json() };
}

async function login(email, password = initialPassword) {
  return request('POST', '/api/auth/login', { body: { email, password } });
}

async function me(token) {
  return request('GET', '/api/auth/me', { token });
}

async function createBy(actorToken, role, label, profile) {
  const email = uniqueEmail(label);
  const result = await request('POST', '/api/accounts', {
    token: actorToken,
    body: {
      name: `Integration ${label}`,
      email,
      password: initialPassword,
      role,
      profile,
    },
  });
  assert.equal(result.response.status, 201, JSON.stringify(result.body));
  assert.equal(typeof result.body.user.id, 'string');
  assert.equal(Object.hasOwn(result.body.user, 'password_hash'), false);
  accounts[label] = { ...result.body.user, email };
  createdUserIds.add(BigInt(result.body.user.id));
  return accounts[label];
}

async function createAdminFixture(label) {
  return createBy(rootToken, 'ADMIN', label, {});
}

function guardProfile(label, salary = '25000.00') {
  return {
    employee_code: uniqueEmployeeCode(label),
    joining_date: '2025-01-15',
    base_salary: salary,
  };
}

function supervisorProfile(label) {
  return {
    employee_code: uniqueEmployeeCode(label),
    joining_date: '2025-01-15',
  };
}

async function assertUnauthorizedRole(actorToken, role, label) {
  const email = uniqueEmail(label);
  const result = await request('POST', '/api/accounts', {
    token: actorToken,
    body: { name: label, email, password: initialPassword, role, profile: {} },
  });
  assert.equal(result.response.status, 403);
  assert.equal(await prisma.users.findUnique({ where: { email } }), null);
}

before(async () => {
  app.set('trust proxy', 'loopback');
  await prisma.$connect();
  prismaConnected = true;

  server = app.listen(0, '127.0.0.1');
  await new Promise((resolve, reject) => {
    server.once('listening', resolve);
    server.once('error', reject);
  });

  bootstrapEmail = uniqueEmail('bootstrap-super-admin');
  const passwordHash = await bcrypt.hash(initialPassword, 12);
  const bootstrapUser = await prisma.users.create({
    data: {
      name: 'SecureGuard Integration Super Admin',
      email: bootstrapEmail,
      password_hash: passwordHash,
      role: 'SUPER_ADMIN',
      is_active: true,
    },
    select: { id: true, email: true, role: true },
  });
  bootstrapUserId = bootstrapUser.id;
  createdUserIds.add(bootstrapUser.id);
});

after(async () => {
  try {
    if (server?.listening) {
      await new Promise((resolve) => server.close(resolve));
    }

    if (prismaConnected && createdEmails.size > 0) {
      const runUsers = await prisma.users.findMany({
        where: { email: { in: [...createdEmails] } },
        select: { id: true, email: true },
      });
      const userIds = [...new Set(runUsers.map((user) => user.id))];

      await prisma.$transaction(async (tx) => {
        if (orphanGuardCodes.size > 0) {
          await tx.guards.deleteMany({ where: { employee_code: { in: [...orphanGuardCodes] } } });
        }
        if (userIds.length > 0) {
          await tx.guards.deleteMany({ where: { user_id: { in: userIds } } });
          await tx.supervisors.deleteMany({ where: { user_id: { in: userIds } } });
          await tx.clients.deleteMany({ where: { user_id: { in: userIds } } });

          const nonBootstrapIds = userIds.filter((id) => id !== bootstrapUserId);
          if (nonBootstrapIds.length > 0) {
            await tx.users.deleteMany({ where: { id: { in: nonBootstrapIds } } });
          }
          if (bootstrapUserId && userIds.includes(bootstrapUserId)) {
            await tx.users.delete({ where: { id: bootstrapUserId } });
          }
        }
      });
    }
  } finally {
    await prisma.$disconnect();
  }
});

test('real MySQL account provisioning, role boundaries, uniqueness, FKs and rollback', { concurrency: false }, async () => {
  const rootLogin = await login(bootstrapEmail);
  assert.equal(rootLogin.response.status, 200);
  rootToken = rootLogin.body.token;

  accounts.admin = await createAdminFixture('root-created-admin');
  accounts.supervisor = await createBy(rootToken, 'SUPERVISOR', 'root-created-supervisor', supervisorProfile('ROOT-SUP'));
  accounts.guard = await createBy(rootToken, 'GUARD', 'root-created-guard', guardProfile('ROOT-GUARD'));
  accounts.client = await createBy(rootToken, 'CLIENT', 'root-created-client', { company_name: 'Root Client Company' });
  accounts.disabledAdmin = await createAdminFixture('disabled-admin');
  accounts.nullActiveAdmin = await createAdminFixture('null-active-admin');
  accounts.adminResetTarget = await createAdminFixture('admin-reset-target');

  const adminLogin = await login(accounts.admin.email);
  assert.equal(adminLogin.response.status, 200);
  adminToken = adminLogin.body.token;

  accounts.adminSupervisor = await createBy(adminToken, 'SUPERVISOR', 'admin-created-supervisor', supervisorProfile('ADMIN-SUP'));
  accounts.adminGuard = await createBy(adminToken, 'GUARD', 'admin-created-guard', guardProfile('ADMIN-GUARD'));
  accounts.adminClient = await createBy(adminToken, 'CLIENT', 'admin-created-client', { company_name: 'Admin Client Company' });

  await assertUnauthorizedRole(rootToken, 'SUPER_ADMIN', 'root-escalation-attempt');
  await assertUnauthorizedRole(adminToken, 'ADMIN', 'admin-escalation-attempt');
  await assertUnauthorizedRole(adminToken, 'SUPER_ADMIN', 'admin-root-escalation-attempt');
  const publicCreate = await request('POST', '/api/accounts', {
    body: { name: 'Public', email: uniqueEmail('public-attempt'), password: initialPassword, role: 'GUARD', profile: guardProfile('PUBLIC') },
  });
  assert.equal(publicCreate.response.status, 401);

  const normalizedDuplicate = await request('POST', '/api/accounts', {
    token: rootToken,
    body: {
      name: 'Duplicate Email',
      email: `  ${accounts.guard.email.toUpperCase()}  `,
      password: initialPassword,
      role: 'CLIENT',
      profile: { company_name: 'Duplicate Email Company' },
    },
  });
  assert.equal(normalizedDuplicate.response.status, 409);

  const duplicateEmployeeCode = await request('POST', '/api/accounts', {
    token: rootToken,
    body: {
      name: 'Duplicate Employee Code',
      email: uniqueEmail('duplicate-employee-code'),
      password: initialPassword,
      role: 'GUARD',
      profile: { ...guardProfile('DUPLICATE'), employee_code: (await prisma.guards.findUnique({
        where: { user_id: BigInt(accounts.guard.id) }, select: { employee_code: true },
      })).employee_code },
    },
  });
  assert.equal(duplicateEmployeeCode.response.status, 409);

  await assert.rejects(prisma.users.create({
    data: {
      name: 'Duplicate Unique Email Probe',
      email: accounts.guard.email,
      password_hash: await bcrypt.hash(initialPassword, 4),
      role: 'ADMIN',
    },
  }), (error) => error.code === 'P2002');

  const rootProfile = await prisma.guards.findUnique({
    where: { user_id: BigInt(accounts.guard.id) },
    select: { employee_code: true },
  });
  await assert.rejects(prisma.guards.create({
    data: {
      user_id: BigInt(accounts.admin.id),
      employee_code: rootProfile.employee_code,
      joining_date: new Date('2025-01-15T00:00:00.000Z'),
      base_salary: '25000.00',
    },
  }), (error) => error.code === 'P2002');

  const orphanProbeCode = uniqueEmployeeCode('FK-PROBE');
  orphanGuardCodes.add(orphanProbeCode);
  // The schema uses UNSIGNED BIGINT, but Prisma's BigInt argument encoding is
  // signed 64-bit. Keep this valid for Prisma and confirm it cannot refer to
  // an existing user before using it to probe the foreign-key constraint.
  const nonexistentUserId = 9_223_372_036_854_775_807n;
  assert.equal(await prisma.users.findUnique({ where: { id: nonexistentUserId }, select: { id: true } }), null);
  await assert.rejects(prisma.guards.create({
    data: {
      user_id: nonexistentUserId,
      employee_code: orphanProbeCode,
      joining_date: new Date('2025-01-15T00:00:00.000Z'),
      base_salary: '25000.00',
    },
  }), (error) => error.code === 'P2003');

  const rollbackEmail = uniqueEmail('transaction-rollback');
  const rollbackCode = uniqueEmployeeCode('ROLLBACK');
  await assert.rejects(createAccount({
    name: 'Rollback Probe',
    email: rollbackEmail,
    password: initialPassword,
    role: 'GUARD',
    profile: {
      employee_code: rollbackCode,
      joining_date: new Date('2025-01-15T00:00:00.000Z'),
      base_salary: undefined,
    },
  }));
  assert.equal(await prisma.users.findUnique({ where: { email: rollbackEmail } }), null);
});

test('login, /me, disabled accounts, and profile status behavior use live MySQL rows', { concurrency: false }, async () => {
  const roleAccounts = [
    ['SUPER_ADMIN', bootstrapEmail],
    ['ADMIN', accounts.admin.email],
    ['SUPERVISOR', accounts.supervisor.email],
    ['GUARD', accounts.guard.email],
    ['CLIENT', accounts.client.email],
  ];

  const sessions = new Map();
  for (const [role, email] of roleAccounts) {
    const session = await login(email);
    assert.equal(session.response.status, 200, `${role} login`);
    assert.equal(session.body.user.role, role);
    assert.equal(Object.hasOwn(session.body.user, 'password_hash'), false);
    sessions.set(role, session.body);

    const current = await me(session.body.token);
    assert.equal(current.response.status, 200, `${role} /me`);
    assert.equal(current.body.user.role, role);
    assert.equal(JSON.stringify(current.body).includes('password_hash'), false);
  }

  const disabledSession = await login(accounts.disabledAdmin.email);
  assert.equal(disabledSession.response.status, 200);
  await prisma.users.update({ where: { id: BigInt(accounts.disabledAdmin.id) }, data: { is_active: false } });
  assert.equal((await me(disabledSession.body.token)).response.status, 401);
  assert.equal((await login(accounts.disabledAdmin.email)).response.status, 401);

  const nullActiveSession = await login(accounts.nullActiveAdmin.email);
  assert.equal(nullActiveSession.response.status, 200);
  await prisma.users.update({ where: { id: BigInt(accounts.nullActiveAdmin.id) }, data: { is_active: null } });
  assert.equal((await me(nullActiveSession.body.token)).response.status, 401);
  assert.equal((await login(accounts.nullActiveAdmin.email)).response.status, 401);

  const supervisorProfile = await prisma.supervisors.findUnique({
    where: { user_id: BigInt(accounts.supervisor.id) }, select: { id: true },
  });
  await prisma.supervisors.update({ where: { id: supervisorProfile.id }, data: { status: 'INACTIVE' } });
  assert.equal((await me(sessions.get('SUPERVISOR').token)).response.status, 401);
  assert.equal((await login(accounts.supervisor.email)).response.status, 401);

  const clientProfile = await prisma.clients.findUnique({
    where: { user_id: BigInt(accounts.client.id) }, select: { id: true },
  });
  await prisma.clients.update({ where: { id: clientProfile.id }, data: { status: 'INACTIVE' } });
  assert.equal((await me(sessions.get('CLIENT').token)).response.status, 401);
  assert.equal((await login(accounts.client.email)).response.status, 401);

  const guardProfile = await prisma.guards.findUnique({
    where: { user_id: BigInt(accounts.guard.id) }, select: { id: true },
  });
  await prisma.guards.update({ where: { id: guardProfile.id }, data: { employment_status: 'ON_LEAVE' } });
  const onLeaveLogin = await login(accounts.guard.email);
  assert.equal(onLeaveLogin.response.status, 200);
  assert.equal((await me(onLeaveLogin.body.token)).response.status, 200);
  await prisma.guards.update({ where: { id: guardProfile.id }, data: { employment_status: 'TERMINATED' } });
  assert.equal((await me(onLeaveLogin.body.token)).response.status, 401);
  assert.equal((await login(accounts.guard.email)).response.status, 401);
});

test('password change and admin reset hash passwords and invalidate earlier JWTs', { concurrency: false }, async () => {
  const target = accounts.adminGuard;
  const targetLogin = await login(target.email);
  assert.equal(targetLogin.response.status, 200);

  const incorrectCurrent = await request('POST', '/api/auth/change-password', {
    token: targetLogin.body.token,
    body: { currentPassword: 'Incorrect-current-password', newPassword: changedPassword },
  });
  assert.equal(incorrectCurrent.response.status, 401);

  const change = await request('POST', '/api/auth/change-password', {
    token: targetLogin.body.token,
    body: { currentPassword: initialPassword, newPassword: changedPassword },
  });
  assert.equal(change.response.status, 200);
  assert.equal(JSON.stringify(change.body).includes('password_hash'), false);
  assert.equal((await me(targetLogin.body.token)).response.status, 401);

  const changedLogin = await login(target.email, changedPassword);
  assert.equal(changedLogin.response.status, 200);
  const storedAfterChange = await prisma.users.findUnique({
    where: { id: BigInt(target.id) }, select: { password_hash: true, updated_at: true },
  });
  assert.equal(await bcrypt.compare(changedPassword, storedAfterChange.password_hash), true);

  const reset = await request('POST', `/api/accounts/${target.id}/reset-password`, {
    token: adminToken,
    body: { newPassword: resetPassword },
  });
  assert.equal(reset.response.status, 200);
  assert.equal(JSON.stringify(reset.body).includes(resetPassword), false);
  assert.equal((await me(targetLogin.body.token)).response.status, 401);
  assert.equal((await me(changedLogin.body.token)).response.status, 401);
  assert.equal((await login(target.email, changedPassword)).response.status, 401);
  assert.equal((await login(target.email, resetPassword)).response.status, 200);

  const adminCannotResetAdmin = await request('POST', `/api/accounts/${accounts.adminResetTarget.id}/reset-password`, {
    token: adminToken,
    body: { newPassword: resetPassword },
  });
  assert.equal(adminCannotResetAdmin.response.status, 403);
});
