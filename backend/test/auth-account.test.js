import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import { randomBytes } from 'node:crypto';
import prisma from '../src/config/prisma.js';
import app from '../src/app.js';

const originalUsersFindUnique = prisma.users.findUnique;
const originalTransaction = prisma.$transaction;
const originalQueryRaw = prisma.$queryRaw;
let server;
let state;
let failGuardProfile = false;
let previousSecret;
let previousExpiry;

function project(user, select) {
  if (!select) return user;
  const result = {};
  for (const key of Object.keys(select)) {
    if (select[key] === true) result[key] = user[key];
    else if (select[key]?.select) result[key] = user[key] ?? null;
  }
  return result;
}

function findUser(where) {
  if (where.email) return state.users.find((user) => user.email === where.email) ?? null;
  return state.users.find((user) => user.id === where.id) ?? null;
}

function queryRows(strings, ...values) {
  const sql = Array.from(strings).join('?');
  const value = values[0];
  if (sql.includes('LOWER(TRIM(email))')) {
    return state.users.filter((user) => user.email.trim().toLowerCase() === value).slice(0, 2).map(({ id }) => ({ id }));
  }
  if (sql.includes('UPPER(TRIM(employee_code))')) {
    const table = sql.includes('FROM guards') ? 'guards' : 'supervisors';
    return state[table].filter((row) => row.employee_code.trim().toUpperCase() === value).slice(0, 1).map(({ id }) => ({ id }));
  }
  return [];
}

function cloneState(value) {
  if (value instanceof Date) return new Date(value);
  if (Array.isArray(value)) return value.map(cloneState);
  if (value && typeof value === 'object' && Object.getPrototypeOf(value) === Object.prototype) {
    return Object.fromEntries(Object.entries(value).map(([key, entry]) => [key, cloneState(entry)]));
  }
  // Prisma.Decimal values are immutable and do not support structuredClone.
  return value;
}

function makeTransactionClient() {
  const table = (name) => ({
    create: async ({ data }) => {
      if (name === 'guards' && failGuardProfile) throw new Error('simulated profile insert failure');
      const rows = state[name];
      if (data.employee_code && rows.some((row) => row.employee_code === data.employee_code)) {
        const error = new Error('unique constraint');
        error.code = 'P2002';
        throw error;
      }
      rows.push({ ...data, id: BigInt(rows.length + 100) });
      return rows.at(-1);
    },
  });

  return {
    $queryRaw: async (strings, ...values) => queryRows(strings, ...values),
    users: {
      create: async ({ data, select }) => {
        if (state.users.some((user) => user.email === data.email)) {
          const error = new Error('unique constraint');
          error.code = 'P2002';
          throw error;
        }
        const user = {
          id: BigInt(Math.max(...state.users.map((entry) => Number(entry.id))) + 1),
          ...data,
          updated_at: new Date('2026-01-01T00:00:00.000Z'),
        };
        state.users.push(user);
        return project(user, select);
      },
      updateMany: async ({ where, data }) => {
        const user = state.users.find((entry) => entry.id === where.id);
        if (!user
          || user.password_hash !== where.password_hash
          || (where.is_active !== undefined && user.is_active !== where.is_active)) {
          return { count: 0 };
        }
        Object.assign(user, data);
        user.updated_at = new Date(Math.floor(user.updated_at.getTime() / 1000) * 1000);
        return { count: 1 };
      },
    },
    guards: table('guards'),
    supervisors: table('supervisors'),
    clients: table('clients'),
  };
}

function responseJson(response) {
  return response.json();
}

async function post(path, body, token) {
  return fetch(`http://127.0.0.1:${server.address().port}${path}`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      ...(token ? { authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify(body),
  });
}

async function login(email, password) {
  const response = await post('/api/auth/login', { email, password });
  return { response, body: await responseJson(response) };
}

function guardInput({ email, employeeCode, password = 'InitialPassword123' }) {
  return {
    name: 'Provisioned Guard',
    email,
    password,
    role: 'GUARD',
    profile: {
      employee_code: employeeCode,
      joining_date: '2025-01-15',
      base_salary: '25000.00',
    },
  };
}

before(async () => {
  previousSecret = process.env.JWT_SECRET;
  previousExpiry = process.env.JWT_EXPIRES_IN;
  process.env.JWT_SECRET = randomBytes(48).toString('base64url');
  process.env.JWT_EXPIRES_IN = '1h';

  const passwordHash = await bcrypt.hash('InitialPassword123', 4);
  const updatedAt = new Date('2026-03-01T00:00:00.000Z');
  state = {
    users: [
      { id: 1n, name: 'Root Admin', email: 'Root@Example.Test', password_hash: passwordHash, role: 'SUPER_ADMIN', is_active: true, updated_at: updatedAt, guards: null, supervisors: null, clients: null },
      { id: 2n, name: 'Admin User', email: 'admin@example.test', password_hash: passwordHash, role: 'ADMIN', is_active: true, updated_at: updatedAt, guards: null, supervisors: null, clients: null },
      { id: 3n, name: 'Guard User', email: 'guard@example.test', password_hash: passwordHash, role: 'GUARD', is_active: true, updated_at: updatedAt, guards: { employment_status: 'ACTIVE' }, supervisors: null, clients: null },
      { id: 4n, name: 'Reset Target', email: 'reset-target@example.test', password_hash: passwordHash, role: 'GUARD', is_active: true, updated_at: updatedAt, guards: { employment_status: 'ACTIVE' }, supervisors: null, clients: null },
      { id: 5n, name: 'Another Admin', email: 'another-admin@example.test', password_hash: passwordHash, role: 'ADMIN', is_active: true, updated_at: updatedAt, guards: null, supervisors: null, clients: null },
      { id: 6n, name: 'Disabled User', email: 'disabled@example.test', password_hash: passwordHash, role: 'ADMIN', is_active: false, updated_at: updatedAt, guards: null, supervisors: null, clients: null },
      { id: 7n, name: 'Leave Guard', email: 'leave@example.test', password_hash: passwordHash, role: 'GUARD', is_active: true, updated_at: updatedAt, guards: { employment_status: 'ON_LEAVE' }, supervisors: null, clients: null },
      { id: 8n, name: 'Terminated Guard', email: 'terminated@example.test', password_hash: passwordHash, role: 'GUARD', is_active: true, updated_at: updatedAt, guards: { employment_status: 'TERMINATED' }, supervisors: null, clients: null },
    ],
    guards: [
      { user_id: 3n, employee_code: 'G-3', employment_status: 'ACTIVE' },
      { user_id: 4n, employee_code: 'G-4', employment_status: 'ACTIVE' },
      { user_id: 7n, employee_code: 'G-7', employment_status: 'ON_LEAVE' },
      { user_id: 8n, employee_code: 'G-8', employment_status: 'TERMINATED' },
    ],
    supervisors: [{ user_id: 7n, employee_code: 's-old', joining_date: new Date('2025-01-01') }],
    clients: [],
  };

  prisma.users.findUnique = async ({ where, select }) => project(findUser(where) ?? {}, select);
  prisma.$queryRaw = async (strings, ...values) => queryRows(strings, ...values);
  prisma.$transaction = async (callback) => {
    const snapshot = cloneState(state);
    try {
      return await callback(makeTransactionClient());
    } catch (error) {
      state = snapshot;
      throw error;
    }
  };

  server = app.listen(0);
  await new Promise((resolve) => server.once('listening', resolve));
});

after(async () => {
  if (server?.listening) await new Promise((resolve) => server.close(resolve));
  prisma.users.findUnique = originalUsersFindUnique;
  prisma.$transaction = originalTransaction;
  prisma.$queryRaw = originalQueryRaw;
  if (previousSecret === undefined) delete process.env.JWT_SECRET;
  else process.env.JWT_SECRET = previousSecret;
  if (previousExpiry === undefined) delete process.env.JWT_EXPIRES_IN;
  else process.env.JWT_EXPIRES_IN = previousExpiry;
});

test('account provisioning, authorization, password management, and safe responses', { concurrency: false }, async () => {
  const root = await login('root@example.test', 'InitialPassword123');
  const admin = await login('admin@example.test', 'InitialPassword123');
  assert.equal(root.response.status, 200);
  assert.equal(admin.response.status, 200);
  const meResponse = await fetch(`http://127.0.0.1:${server.address().port}/api/auth/me`, {
    headers: { authorization: `Bearer ${root.body.token}` },
  });
  const meBody = await meResponse.text();
  assert.equal(meResponse.status, 200);
  assert.equal(meBody.includes('password_hash'), false);
  assert.equal(meBody.includes('InitialPassword123'), false);

  const noPublicRegistration = await post('/api/accounts', guardInput({ email: 'public@example.test', employeeCode: 'PUBLIC' }));
  assert.equal(noPublicRegistration.status, 401);

  const rootCannotCreateRoot = await post('/api/accounts', {
    name: 'Escalated', email: 'escalated@example.test', password: 'InitialPassword123', role: 'SUPER_ADMIN', profile: {},
  }, root.body.token);
  assert.equal(rootCannotCreateRoot.status, 403);

  const rootCanCreateAdmin = await post('/api/accounts', {
    name: 'Created Admin', email: 'created-admin@example.test', password: 'InitialPassword123', role: 'ADMIN', profile: {},
  }, root.body.token);
  assert.equal(rootCanCreateAdmin.status, 201);
  const createdAdminBody = await responseJson(rootCanCreateAdmin);
  assert.equal(createdAdminBody.user.email, 'created-admin@example.test');
  assert.equal(JSON.stringify(createdAdminBody).includes('password_hash'), false);
  assert.equal(JSON.stringify(createdAdminBody).includes('InitialPassword123'), false);
  const createdAdmin = state.users.find((user) => user.email === 'created-admin@example.test');
  assert.notEqual(createdAdmin.password_hash, 'InitialPassword123');
  assert.equal(await bcrypt.compare('InitialPassword123', createdAdmin.password_hash), true);

  const rootCanCreateSupervisor = await post('/api/accounts', {
    name: 'Created Supervisor', email: 'created-supervisor@example.test', password: 'InitialPassword123', role: 'SUPERVISOR',
    profile: { employee_code: 'S-NEW', joining_date: '2025-02-01' },
  }, root.body.token);
  assert.equal(rootCanCreateSupervisor.status, 201);
  assert.equal(state.supervisors.some((profile) => profile.employee_code === 'S-NEW'), true);

  const rootCanCreateGuard = await post('/api/accounts', guardInput({ email: 'created-guard@example.test', employeeCode: 'G-NEW' }), root.body.token);
  assert.equal(rootCanCreateGuard.status, 201);
  assert.equal(state.guards.some((profile) => profile.employee_code === 'G-NEW'), true);

  const rootCanCreateClient = await post('/api/accounts', {
    name: 'Created Client', email: 'created-client@example.test', password: 'InitialPassword123', role: 'CLIENT',
    profile: { company_name: 'Example Ltd', company_email: '  BILLING@EXAMPLE.TEST  ' },
  }, root.body.token);
  assert.equal(rootCanCreateClient.status, 201);
  assert.equal(state.clients.at(-1).company_email, 'billing@example.test');

  for (const [email, code, role, profile] of [
    ['admin-supervisor@example.test', 'S-ADMIN', 'SUPERVISOR', { employee_code: 'S-ADMIN', joining_date: '2025-03-01' }],
    ['admin-guard@example.test', 'G-ADMIN', 'GUARD', { employee_code: 'G-ADMIN', joining_date: '2025-03-01', base_salary: '18000' }],
    ['admin-client@example.test', 'C-ADMIN', 'CLIENT', { company_name: 'Admin Client Ltd' }],
  ]) {
    const result = await post('/api/accounts', {
      name: 'Admin Created', email, password: 'InitialPassword123', role, profile,
    }, admin.body.token);
    assert.equal(result.status, 201);
  }

  const adminCannotCreateAdmin = await post('/api/accounts', {
    name: 'Escalated Admin', email: 'escalated-admin@example.test', password: 'InitialPassword123', role: 'ADMIN', profile: {},
  }, admin.body.token);
  assert.equal(adminCannotCreateAdmin.status, 403);

  const duplicateEmail = await post('/api/accounts', guardInput({ email: ' GUARD@EXAMPLE.TEST ', employeeCode: 'DUP-EMAIL' }), root.body.token);
  assert.equal(duplicateEmail.status, 409);
  const duplicateEmployeeCode = await post('/api/accounts', {
    name: 'Duplicate Code', email: 'duplicate-code@example.test', password: 'InitialPassword123', role: 'SUPERVISOR',
    profile: { employee_code: 'S-OLD', joining_date: '2025-02-02' },
  }, root.body.token);
  assert.equal(duplicateEmployeeCode.status, 409);

  const beforeRollbackCount = state.users.length;
  failGuardProfile = true;
  const originalConsoleError = console.error;
  console.error = () => {};
  let rollbackResponse;
  try {
    rollbackResponse = await post('/api/accounts', guardInput({ email: 'rollback@example.test', employeeCode: 'G-ROLLBACK' }), root.body.token);
  } finally {
    failGuardProfile = false;
    console.error = originalConsoleError;
  }
  assert.equal(rollbackResponse.status, 500);
  assert.equal(state.users.length, beforeRollbackCount);
  assert.equal(state.users.some((user) => user.email === 'rollback@example.test'), false);

  const guard = await login('guard@example.test', 'InitialPassword123');
  const incorrectCurrentPassword = await post('/api/auth/change-password', {
    currentPassword: 'WrongPassword123', newPassword: 'ChangedPassword123',
  }, guard.body.token);
  assert.equal(incorrectCurrentPassword.status, 401);
  const changedPassword = await post('/api/auth/change-password', {
    currentPassword: 'InitialPassword123', newPassword: 'ChangedPassword123',
  }, guard.body.token);
  assert.equal(changedPassword.status, 200);
  assert.equal((await changedPassword.text()).includes('password_hash'), false);
  const oldGuardToken = await fetch(`http://127.0.0.1:${server.address().port}/api/auth/me`, {
    headers: { authorization: `Bearer ${guard.body.token}` },
  });
  assert.equal(oldGuardToken.status, 401);
  const newGuardCredentials = await login('guard@example.test', 'ChangedPassword123');
  assert.equal(newGuardCredentials.response.status, 200);

  const resetTarget = await login('reset-target@example.test', 'InitialPassword123');
  const resetResponse = await post('/api/accounts/4/reset-password', {
    newPassword: 'ResetPassword123',
  }, root.body.token);
  assert.equal(resetResponse.status, 200);
  assert.equal((await resetResponse.text()).includes('ResetPassword123'), false);
  const oldResetToken = await fetch(`http://127.0.0.1:${server.address().port}/api/auth/me`, {
    headers: { authorization: `Bearer ${resetTarget.body.token}` },
  });
  assert.equal(oldResetToken.status, 401);
  assert.equal((await login('reset-target@example.test', 'ResetPassword123')).response.status, 200);

  const adminCannotResetAdmin = await post('/api/accounts/5/reset-password', {
    newPassword: 'ResetPassword123',
  }, admin.body.token);
  assert.equal(adminCannotResetAdmin.status, 403);

  const invalidPassword = await post('/api/accounts', guardInput({
    email: 'invalid-policy@example.test', employeeCode: 'G-POLICY', password: 'short',
  }), root.body.token);
  assert.equal(invalidPassword.status, 400);
});

test('two password changes within one second invalidate both earlier tokens', { concurrency: false }, async () => {
  const initialLogin = await login('guard@example.test', 'ChangedPassword123');
  assert.equal(initialLogin.response.status, 200);
  const firstToken = initialLogin.body.token;
  const originalNow = Date.now;
  const fixedSecond = Math.floor(originalNow() / 1000) * 1000;
  Date.now = () => fixedSecond;

  try {
    const firstChange = await post('/api/auth/change-password', {
      currentPassword: 'ChangedPassword123',
      newPassword: 'RapidChangePassword234',
    }, firstToken);
    assert.equal(firstChange.status, 200);
    const user = state.users.find((entry) => entry.id === 3n);
    const versionAfterFirst = user.updated_at.getTime();
    const tokenBetweenChanges = jwt.sign({
      sub: '3',
      role: 'GUARD',
      av: String(versionAfterFirst),
    }, process.env.JWT_SECRET, {
      algorithm: 'HS256',
      issuer: 'secureguard-api',
      audience: 'secureguard-client',
      expiresIn: 3600,
    });

    const secondChange = await post('/api/auth/change-password', {
      currentPassword: 'RapidChangePassword234',
      newPassword: 'RapidSecondPassword345',
    }, tokenBetweenChanges);
    assert.equal(secondChange.status, 200);
    const versionAfterSecond = user.updated_at.getTime();
    assert.equal(versionAfterSecond, versionAfterFirst + 1000);

    const firstTokenResponse = await fetch(`http://127.0.0.1:${server.address().port}/api/auth/me`, {
      headers: { authorization: `Bearer ${firstToken}` },
    });
    const betweenChangesResponse = await fetch(`http://127.0.0.1:${server.address().port}/api/auth/me`, {
      headers: { authorization: `Bearer ${tokenBetweenChanges}` },
    });
    assert.equal(firstTokenResponse.status, 401);
    assert.equal(betweenChangesResponse.status, 401);
  } finally {
    Date.now = originalNow;
  }
});

test('JWT claims, database account state, profile status, and safe URL handling', { concurrency: false }, async () => {
  const makeToken = (id, role, claims = {}, options = {}) => {
    const currentUser = state.users.find((user) => user.id.toString() === String(id));
    const payload = {
      sub: String(id),
      role,
      av: currentUser?.updated_at ? String(currentUser.updated_at.getTime()) : '0',
      ...claims,
    };
    return jwt.sign(payload, process.env.JWT_SECRET, {
      algorithm: 'HS256',
      issuer: 'secureguard-api',
      audience: 'secureguard-client',
      expiresIn: 3600,
      ...options,
    });
  };
  const getMe = (token) => fetch(`http://127.0.0.1:${server.address().port}/api/auth/me`, {
    headers: { authorization: `Bearer ${token}` },
  });

  assert.equal((await getMe(makeToken('6', 'ADMIN'))).status, 401); // disabled account
  assert.equal((await getMe(makeToken('2', 'SUPER_ADMIN'))).status, 401); // role changed/mismatch
  assert.equal((await getMe(makeToken('7', 'GUARD'))).status, 200); // ON_LEAVE remains allowed
  assert.equal((await getMe(makeToken('8', 'GUARD'))).status, 401); // TERMINATED profile
  assert.equal((await getMe(makeToken('18446744073709551616', 'ADMIN'))).status, 401); // BigInt overflow

  assert.equal((await getMe(makeToken('1', 'SUPER_ADMIN', {}, { expiresIn: -1 }))).status, 401);
  const noExpiryToken = jwt.sign({ sub: '1', role: 'SUPER_ADMIN', av: String(state.users[0].updated_at.getTime()) }, process.env.JWT_SECRET, {
    algorithm: 'HS256', issuer: 'secureguard-api', audience: 'secureguard-client',
  });
  assert.equal((await getMe(noExpiryToken)).status, 401);
  assert.equal((await getMe(makeToken('1', 'SUPER_ADMIN', {}, { issuer: 'wrong-issuer' }))).status, 401);
  assert.equal((await getMe(makeToken('1', 'SUPER_ADMIN', {}, { audience: 'wrong-audience' }))).status, 401);
  const invalidSignature = jwt.sign({ sub: '1', role: 'SUPER_ADMIN' }, 'incorrect-signing-secret');
  assert.equal((await getMe(invalidSignature)).status, 401);

  const onLeaveLogin = await login('leave@example.test', 'InitialPassword123');
  const terminatedLogin = await login('terminated@example.test', 'InitialPassword123');
  assert.equal(onLeaveLogin.response.status, 200);
  assert.equal(terminatedLogin.response.status, 401);

  state.users.push({
    id: 9n, name: 'Case Collision A', email: 'ambiguous@example.test', password_hash: state.users[0].password_hash,
    role: 'ADMIN', is_active: true, updated_at: state.users[0].updated_at, guards: null, supervisors: null, clients: null,
  }, {
    id: 10n, name: 'Case Collision B', email: 'Ambiguous@Example.Test', password_hash: state.users[0].password_hash,
    role: 'ADMIN', is_active: true, updated_at: state.users[0].updated_at, guards: null, supervisors: null, clients: null,
  });
  const ambiguousEmail = await login(' AMBIGUOUS@EXAMPLE.TEST ', 'InitialPassword123');
  assert.equal(ambiguousEmail.response.status, 401);
  assert.equal(ambiguousEmail.body.message, 'Invalid email or password.');

  const sensitiveQuery = 'jwt-query-marker-must-not-leak';
  const originalWrite = process.stdout.write;
  let accessLog = '';
  process.stdout.write = function captureAccessLog(chunk, ...args) {
    accessLog += String(chunk);
    return true;
  };
  let notFound;
  try {
    notFound = await fetch(`http://127.0.0.1:${server.address().port}/missing?token=${sensitiveQuery}`);
  } finally {
    process.stdout.write = originalWrite;
  }
  const notFoundBody = await notFound.text();
  assert.equal(notFound.status, 404);
  assert.equal(notFoundBody.includes(sensitiveQuery), false);
  assert.equal(accessLog.includes(sensitiveQuery), false);

  const queryTokenResponse = await fetch(`http://127.0.0.1:${server.address().port}/api/auth/me?token=${encodeURIComponent(onLeaveLogin.body.token)}`);
  assert.equal(queryTokenResponse.status, 401);

  // The test suite has now made ten login attempts from this client IP; the next is rate-limited.
  const rateLimited = await login('root@example.test', 'InitialPassword123');
  assert.equal(rateLimited.response.status, 429);
});
