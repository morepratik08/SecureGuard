import { randomBytes } from 'node:crypto';

export function validateIntegrationDatabaseUrl(value) {
  if (typeof value !== 'string' || !value.trim()) {
    throw new Error('Set SECUREGUARD_TEST_DATABASE_URL to a dedicated disposable MySQL URL.');
  }

  let parsed;
  try {
    parsed = new URL(value);
  } catch {
    throw new Error('SECUREGUARD_TEST_DATABASE_URL is not a valid MySQL URL.');
  }

  let databaseName;
  try {
    databaseName = decodeURIComponent(parsed.pathname.slice(1));
  } catch {
    throw new Error('SECUREGUARD_TEST_DATABASE_URL is not a valid MySQL URL.');
  }

  if (parsed.protocol !== 'mysql:'
    || !parsed.hostname
    || !parsed.username
    || parsed.hash
    || databaseName !== 'secureguard_test'
    || parsed.searchParams.has('database')
    || parsed.searchParams.has('schema')) {
    throw new Error('SECUREGUARD_TEST_DATABASE_URL must target only the secureguard_test MySQL database.');
  }

  return parsed.toString();
}

async function importIntegrationModules() {
  const [appModule, prismaModule, accountModule, bcryptModule] = await Promise.all([
    import('../src/app.js'),
    import('../src/config/prisma.js'),
    import('../src/services/account.service.js'),
    import('bcrypt'),
  ]);

  return {
    app: appModule.default,
    prisma: prismaModule.default,
    createAccount: accountModule.createAccount,
    bcrypt: bcryptModule.default,
  };
}

export async function bootstrapIntegrationTest(databaseUrl, loadModules = importIntegrationModules) {
  const validatedUrl = validateIntegrationDatabaseUrl(databaseUrl);

  // These assignments intentionally replace, never inspect, regular runtime values.
  process.env.DATABASE_URL = validatedUrl;
  process.env.JWT_SECRET = randomBytes(48).toString('base64url');
  process.env.JWT_EXPIRES_IN = '1h';

  return loadModules();
}
