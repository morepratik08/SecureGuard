import { randomBytes } from 'node:crypto';
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import prisma from '../config/prisma.js';
import { HttpError } from '../utils/http-error.js';

const dummyPasswordHash = bcrypt.hashSync(randomBytes(32).toString('hex'), 10);
const USER_ROLES = new Set(['SUPER_ADMIN', 'ADMIN', 'SUPERVISOR', 'GUARD', 'CLIENT']);
const JWT_ISSUER = 'secureguard-api';
const JWT_AUDIENCE = 'secureguard-client';
const MAX_TOKEN_LIFETIME_SECONDS = 24 * 60 * 60;
const PLACEHOLDER_SECRETS = new Set([
  'secret',
  'changeme',
  'change_me',
  'your_secret_here',
  'replace_me',
  'replace_with_a_random_secret_of_at_least_32_characters',
]);

function getJwtSecret() {
  const secret = process.env.JWT_SECRET;
  const normalized = secret?.trim().toLowerCase();
  const repeatedPattern = typeof secret === 'string' && /^(.)\1+$/.test(secret);
  const distinctCharacters = new Set(secret ?? '').size;
  if (!secret
    || Buffer.byteLength(secret, 'utf8') < 32
    || PLACEHOLDER_SECRETS.has(normalized)
    || normalized?.startsWith('replace_with_')
    || normalized?.startsWith('change_me_')
    || repeatedPattern
    || distinctCharacters < 12) {
    throw new Error('JWT_SECRET must be a non-placeholder secret with at least 32 bytes of strong random data.');
  }
  return secret;
}

function getTokenLifetimeSeconds() {
  const configured = process.env.JWT_EXPIRES_IN || '1h';
  const match = configured.match(/^(\d+)(s|m|h|d)?$/i);
  if (!match) {
    throw new Error('JWT_EXPIRES_IN must be an integer duration up to 24 hours (for example, 15m or 1h).');
  }

  const amount = Number(match[1]);
  const multiplier = ({ s: 1, m: 60, h: 3600, d: 86400 })[match[2]?.toLowerCase()] ?? 1;
  const lifetimeSeconds = amount * multiplier;
  if (!Number.isSafeInteger(lifetimeSeconds)
    || lifetimeSeconds < 1
    || lifetimeSeconds > MAX_TOKEN_LIFETIME_SECONDS) {
    throw new Error('JWT_EXPIRES_IN must be between 1 second and 24 hours.');
  }
  return lifetimeSeconds;
}

export function isProfileAllowed(user) {
  switch (user.role) {
    case 'GUARD':
      return ['ACTIVE', 'ON_LEAVE'].includes(user.guards?.employment_status);
    case 'SUPERVISOR':
      return user.supervisors?.status === 'ACTIVE';
    case 'CLIENT':
      return user.clients?.status === 'ACTIVE';
    default:
      return true;
  }
}

export async function login({ email, password }) {
  // LOWER(email) makes lookup semantics explicit instead of relying on MySQL collation.
  const matches = await prisma.$queryRaw`SELECT id FROM users WHERE LOWER(TRIM(email)) = ${email} LIMIT 2`;
  const userId = matches.length === 1 ? matches[0].id : undefined;
  const user = userId === undefined ? null : await prisma.users.findUnique({
    where: { id: userId },
    select: {
      id: true,
      name: true,
      email: true,
      password_hash: true,
      role: true,
      is_active: true,
      updated_at: true,
      guards: { select: { employment_status: true } },
      supervisors: { select: { status: true } },
      clients: { select: { status: true } },
    },
  });

  const passwordMatches = await bcrypt.compare(password, user?.password_hash ?? dummyPasswordHash);
  if (!user || !passwordMatches || user.is_active !== true || !isProfileAllowed(user)) {
    throw new HttpError(401, 'Invalid email or password.');
  }

  if (!USER_ROLES.has(user.role)) {
    throw new Error('User record has an unsupported role.');
  }

  const secret = getJwtSecret();
  const expiresIn = getTokenLifetimeSeconds();
  const token = jwt.sign(
    { sub: user.id.toString(), role: user.role, av: getAuthVersion(user.updated_at) },
    secret,
    {
      algorithm: 'HS256',
      expiresIn,
      issuer: JWT_ISSUER,
      audience: JWT_AUDIENCE,
    },
  );

  return {
    token,
    user: {
      id: user.id.toString(),
      name: user.name,
      email: user.email,
      role: user.role,
    },
  };
}

export function verifyAccessToken(token) {
  const secret = getJwtSecret();
  const claims = jwt.verify(token, secret, {
    algorithms: ['HS256'],
    issuer: JWT_ISSUER,
    audience: JWT_AUDIENCE,
  });
  const nowSeconds = Math.floor(Date.now() / 1000);
  if (!claims
    || typeof claims !== 'object'
    || !Number.isInteger(claims.iat)
    || !Number.isInteger(claims.exp)
    || claims.exp <= nowSeconds
    || claims.exp <= claims.iat
    || claims.exp - claims.iat > MAX_TOKEN_LIFETIME_SECONDS) {
    throw new jwt.JsonWebTokenError('Invalid token lifetime.');
  }
  return claims;
}

export async function getUserAuthenticationContext(userId) {
  const parsedUserId = parseUserId(userId);
  if (!parsedUserId) return null;

  return prisma.users.findUnique({
    where: { id: parsedUserId },
    select: {
      id: true,
      role: true,
      is_active: true,
      updated_at: true,
      guards: { select: { employment_status: true } },
      supervisors: { select: { status: true } },
      clients: { select: { status: true } },
    },
  });
}

export function getAuthVersion(updatedAt) {
  return String(updatedAt instanceof Date ? updatedAt.getTime() : 0);
}

export async function getCurrentUser(userId) {
  const parsedUserId = parseUserId(userId);
  if (!parsedUserId) {
    throw new HttpError(401, 'Authentication required.');
  }

  const user = await prisma.users.findUnique({
    where: { id: parsedUserId },
    select: {
      id: true,
      name: true,
      email: true,
      role: true,
      is_active: true,
    },
  });

  if (!user || user.is_active !== true || !USER_ROLES.has(user.role)) {
    throw new HttpError(401, 'Authentication required.');
  }

  return {
    id: user.id.toString(),
    name: user.name,
    email: user.email,
    role: user.role,
  };
}

export function parseUserId(value) {
  if (typeof value !== 'string' || !/^[1-9]\d{0,19}$/.test(value)) return null;

  try {
    const id = BigInt(value);
    return id <= 18_446_744_073_709_551_615n ? id : null;
  } catch {
    return null;
  }
}
