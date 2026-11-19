import 'dotenv/config';
import bcrypt from 'bcrypt';
import { stdin, stdout } from 'node:process';
import prisma from '../src/config/prisma.js';
import { nextAuthVersion } from '../src/services/account.service.js';
import { HttpError } from '../src/utils/http-error.js';
import { normalizeEmail } from '../src/utils/normalize-email.js';
import { validateNewPassword } from '../src/validators/account.validator.js';
import { InteractivePromptError, promptHiddenPassword, promptText } from './prompt-utils.js';

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const BCRYPT_ROUNDS = 12;

class RecoveryError extends Error {}

function validateEmail(value) {
  const email = normalizeEmail(value);
  if (!email || email.length > 150 || !EMAIL_PATTERN.test(email)) {
    throw new RecoveryError('Enter a valid email address of at most 150 characters.');
  }
  return email;
}

async function verifySuperAdmin(email) {
  const user = await prisma.users.findUnique({
    where: { email },
    select: { id: true, role: true },
  });
  if (!user || user.role !== 'SUPER_ADMIN') {
    throw new RecoveryError('No matching SUPER_ADMIN account was found. Check the email and try again.');
  }
}

async function updateSuperAdminPassword(email, passwordHash) {
  await prisma.$transaction(async (tx) => {
    const user = await tx.users.findUnique({
      where: { email },
      select: { id: true, role: true, password_hash: true, updated_at: true },
    });
    if (!user || user.role !== 'SUPER_ADMIN') {
      throw new RecoveryError('No matching SUPER_ADMIN account was found. No account was changed.');
    }

    const result = await tx.users.updateMany({
      where: {
        id: user.id,
        role: 'SUPER_ADMIN',
        password_hash: user.password_hash,
        updated_at: user.updated_at,
      },
      data: {
        password_hash: passwordHash,
        updated_at: nextAuthVersion(user.updated_at),
      },
    });

    if (result.count !== 1) {
      throw new RecoveryError('The account changed during recovery. No password was updated; verify the account and retry.');
    }
  }, { timeout: 30000 });
}

function safeFailureMessage(error) {
  if (error instanceof RecoveryError || error instanceof InteractivePromptError) return error.message;
  if (error instanceof HttpError) return error.publicMessage;
  if (error?.code === 'P2034') return 'A concurrent database update prevented recovery. Verify the account and retry if needed.';
  return 'Password recovery failed. Check database availability and permissions; no credentials or database details were printed.';
}

async function main() {
  if (!stdin.isTTY || !stdout.isTTY) {
    throw new InteractivePromptError('Run npm run reset:super-admin from an interactive terminal.');
  }

  const email = validateEmail(await promptText('Super Admin email: '));
  await verifySuperAdmin(email);
  const password = validateNewPassword(await promptHiddenPassword('New password (input hidden): '));
  const passwordHash = await bcrypt.hash(password, BCRYPT_ROUNDS);

  await updateSuperAdminPassword(email, passwordHash);
  stdout.write('Super Admin password updated. Previously issued JWTs are invalidated.\n');
}

try {
  await main();
} catch (error) {
  stdout.write(`${safeFailureMessage(error)}\n`);
  process.exitCode = 1;
} finally {
  try {
    await prisma.$disconnect();
  } catch {
    stdout.write('Warning: Prisma could not confirm a clean disconnect.\n');
    process.exitCode = 1;
  }
}
