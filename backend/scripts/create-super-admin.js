import 'dotenv/config';
import bcrypt from 'bcrypt';
import { stdin, stdout } from 'node:process';
import prisma from '../src/config/prisma.js';
import { HttpError } from '../src/utils/http-error.js';
import { normalizeEmail } from '../src/utils/normalize-email.js';
import { validateNewPassword } from '../src/validators/account.validator.js';
import { InteractivePromptError, promptHiddenPassword, promptText } from './prompt-utils.js';

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const BCRYPT_ROUNDS = 12;
const BOOTSTRAP_LOCK_NAME = 'secureguard:super-admin-bootstrap';
const BOOTSTRAP_LOCK_WAIT_SECONDS = 15;

class BootstrapInputError extends InteractivePromptError {}

function validateName(value) {
  const name = value.trim();
  if (!name || name.length > 100) {
    throw new BootstrapInputError('Full name is required and must be at most 100 characters.');
  }
  return name;
}

function validateEmail(value) {
  const email = normalizeEmail(value);
  if (!email || email.length > 150 || !EMAIL_PATTERN.test(email)) {
    throw new BootstrapInputError('Enter a valid email address of at most 150 characters.');
  }
  return email;
}

function safeFailureMessage(error) {
  if (error instanceof BootstrapInputError) return error.message;
  if (error instanceof HttpError) return error.publicMessage;
  if (error?.code === 'P2002') return 'An account with that email address already exists. No account was changed.';
  if (error?.code === 'P2034') return 'A concurrent database update prevented bootstrap. Check whether a Super Admin now exists, then retry if needed.';
  return 'Super Admin bootstrap failed. Check database availability and permissions; no credentials or database details were printed.';
}

async function createSuperAdmin({ name, email, passwordHash }) {
  return prisma.$transaction(async (tx) => {
    const lockResult = await tx.$queryRaw`
      SELECT GET_LOCK(${BOOTSTRAP_LOCK_NAME}, ${BOOTSTRAP_LOCK_WAIT_SECONDS}) AS acquired
    `;
    if (Number(lockResult[0]?.acquired) !== 1) {
      throw new BootstrapInputError('Could not acquire the database bootstrap lock. Wait briefly and try again.');
    }

    // Do not release the named lock from inside the transaction: Prisma commits
    // only after this callback returns. Keep the session lock through commit;
    // this one-shot CLI releases it when $disconnect closes the pool below.
    const existing = await tx.$queryRaw`
      SELECT id FROM users WHERE role = 'SUPER_ADMIN' LIMIT 1 FOR UPDATE
    `;
    if (existing.length > 0) {
      throw new BootstrapInputError('A SUPER_ADMIN account already exists. No account was changed.');
    }

    return tx.users.create({
      data: {
        name,
        email,
        password_hash: passwordHash,
        role: 'SUPER_ADMIN',
        is_active: true,
      },
      select: { id: true, role: true },
    });
  }, { timeout: 30000 });
}

async function main() {
  if (!stdin.isTTY || !stdout.isTTY) {
    throw new BootstrapInputError('Run npm run bootstrap from an interactive terminal.');
  }

  const name = validateName(await promptText('Full name: '));
  const email = validateEmail(await promptText('Email address: '));
  const password = validateNewPassword(await promptHiddenPassword('Password (input hidden): '));
  const passwordHash = await bcrypt.hash(password, BCRYPT_ROUNDS);

  const created = await createSuperAdmin({ name, email, passwordHash });
  stdout.write(`Created ${created.role} account (user ID ${created.id.toString()}).\n`);
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
