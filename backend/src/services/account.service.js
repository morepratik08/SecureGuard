import bcrypt from 'bcrypt';
import { Prisma } from '@prisma/client';
import prisma from '../config/prisma.js';
import { HttpError } from '../utils/http-error.js';
import { normalizeEmail } from '../utils/normalize-email.js';
import { parseUserId } from './auth.service.js';

const BCRYPT_ROUNDS = 12;

function safeUser(user) {
  return {
    id: user.id.toString(),
    name: user.name,
    email: user.email,
    role: user.role,
  };
}

function nextAuthVersion(updatedAt) {
  const previousMs = updatedAt instanceof Date ? updatedAt.getTime() : 0;
  const nowMs = Math.floor(Date.now() / 1000) * 1000;
  // users.updated_at is TIMESTAMP(0); advance at least one whole second to avoid version collisions.
  return new Date(Math.max(nowMs, previousMs + 1000));
}

function decimal(value) {
  return value === undefined || value === null ? value : new Prisma.Decimal(value);
}

function mapUniqueConstraintError(error) {
  if (error?.code === 'P2002') {
    throw new HttpError(409, 'An account with the provided email or employee code already exists.');
  }
  throw error;
}

export async function createAccount(input) {
  const passwordHash = await bcrypt.hash(input.password, BCRYPT_ROUNDS);
  const normalizedEmail = normalizeEmail(input.email);

  try {
    return await prisma.$transaction(async (tx) => {
      const existingEmail = await tx.$queryRaw`SELECT id FROM users WHERE LOWER(TRIM(email)) = ${normalizedEmail} LIMIT 1`;
      if (existingEmail.length > 0) {
        throw new HttpError(409, 'An account with the provided email or employee code already exists.');
      }

      if (input.role === 'GUARD') {
        const matchingCode = await tx.$queryRaw`SELECT id FROM guards WHERE UPPER(TRIM(employee_code)) = ${profileCode(input)} LIMIT 1`;
        if (matchingCode.length > 0) {
          throw new HttpError(409, 'An account with the provided email or employee code already exists.');
        }
      } else if (input.role === 'SUPERVISOR') {
        const matchingCode = await tx.$queryRaw`SELECT id FROM supervisors WHERE UPPER(TRIM(employee_code)) = ${profileCode(input)} LIMIT 1`;
        if (matchingCode.length > 0) {
          throw new HttpError(409, 'An account with the provided email or employee code already exists.');
        }
      }

      const user = await tx.users.create({
        data: {
          name: input.name,
          email: normalizedEmail,
          password_hash: passwordHash,
          role: input.role,
          is_active: true,
          ...(input.phone === undefined ? {} : { phone: input.phone }),
        },
        select: { id: true, name: true, email: true, role: true },
      });

      const profile = input.profile;
      if (input.role === 'SUPERVISOR') {
        await tx.supervisors.create({
          data: {
            user_id: user.id,
            employee_code: profile.employee_code,
            joining_date: profile.joining_date,
          },
        });
      } else if (input.role === 'GUARD') {
        const { base_salary, experience_years, ...guardFields } = profile;
        await tx.guards.create({
          data: {
            ...guardFields,
            ...(experience_years === undefined ? {} : { experience_years: decimal(experience_years) }),
            base_salary: decimal(base_salary),
            user_id: user.id,
          },
        });
      } else if (input.role === 'CLIENT') {
        await tx.clients.create({
          data: { ...profile, user_id: user.id },
        });
      }

      return safeUser(user);
    });
  } catch (error) {
    mapUniqueConstraintError(error);
  }
}

function profileCode(input) {
  return input.profile.employee_code;
}

async function replacePassword({ user, newPassword, requireActive = false }) {
  const newHash = await bcrypt.hash(newPassword, BCRYPT_ROUNDS);
  const id = user.id;
  const result = await prisma.$transaction((tx) => tx.users.updateMany({
    where: {
      id,
      password_hash: user.password_hash,
      ...(requireActive ? { is_active: true } : {}),
    },
    data: {
      password_hash: newHash,
      updated_at: nextAuthVersion(user.updated_at),
    },
  }));

  if (result.count !== 1) {
    throw new HttpError(409, 'The account changed during this request. Please try again.');
  }
}

export async function changePassword({ userId, currentPassword, newPassword }) {
  const id = parseUserId(userId);
  if (!id) throw new HttpError(401, 'Authentication required.');

  const user = await prisma.users.findUnique({
    where: { id },
    select: { id: true, password_hash: true, is_active: true, updated_at: true },
  });
  if (!user || user.is_active !== true) throw new HttpError(401, 'Authentication required.');

  const currentMatches = await bcrypt.compare(currentPassword, user.password_hash);
  if (!currentMatches) throw new HttpError(401, 'Current password is incorrect.');
  if (await bcrypt.compare(newPassword, user.password_hash)) {
    throw new HttpError(400, 'The new password must differ from the current password.');
  }

  await replacePassword({ user, newPassword, requireActive: true });
}

export async function resetPassword({ actorRole, actorId, targetId, newPassword }) {
  const id = parseUserId(targetId);
  const requesterId = parseUserId(actorId);
  if (!id || !requesterId) throw new HttpError(400, 'A valid account ID is required.');
  if (id === requesterId) {
    throw new HttpError(400, 'Use the change-password endpoint for your own account.');
  }

  const target = await prisma.users.findUnique({
    where: { id },
    select: { id: true, role: true, password_hash: true, is_active: true, updated_at: true },
  });
  if (!target) throw new HttpError(404, 'Account not found.');

  const allowedTargetRoles = actorRole === 'SUPER_ADMIN'
    ? new Set(['ADMIN', 'SUPERVISOR', 'GUARD', 'CLIENT'])
    : actorRole === 'ADMIN'
      ? new Set(['SUPERVISOR', 'GUARD', 'CLIENT'])
      : new Set();
  if (!allowedTargetRoles.has(target.role)) {
    throw new HttpError(403, 'You are not authorized to reset this account password.');
  }

  await replacePassword({ user: target, newPassword });
}
