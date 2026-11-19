import assert from 'node:assert/strict';
import { test } from 'node:test';
import { bootstrapIntegrationTest, validateIntegrationDatabaseUrl } from './integration-test-bootstrap.js';

test('missing dedicated test URL is rejected', () => {
  assert.throws(() => validateIntegrationDatabaseUrl(undefined), /SECUREGUARD_TEST_DATABASE_URL/);
});

test('only a MySQL URL whose database is exactly secureguard_test is accepted', () => {
  const safeUrl = validateIntegrationDatabaseUrl('mysql://test_user:test_password@127.0.0.1:3306/secureguard_test');
  assert.match(new URL(safeUrl).pathname, /^\/secureguard_test$/);

  for (const unsafeUrl of [
    'not-a-url',
    'postgresql://test_user:test_password@127.0.0.1:5432/secureguard_test',
    'mysql://test_user:test_password@127.0.0.1:3306/secureguard_db',
    'mysql://test_user:test_password@127.0.0.1:3306/another_database',
    'mysql://test_user:test_password@127.0.0.1:3306/secureguard_test/extra',
    'mysql://test_user:test_password@127.0.0.1:3306/secureguard_test?database=secureguard_db',
    'mysql://test_user:test_password@127.0.0.1:3306/secureguard_test?schema=secureguard_db',
  ]) {
    assert.throws(() => validateIntegrationDatabaseUrl(unsafeUrl));
  }
});

test('unsafe URLs are rejected before Prisma or application modules are imported', async () => {
  let moduleLoadAttempted = false;
  const loader = async () => {
    moduleLoadAttempted = true;
    return {};
  };

  await assert.rejects(
    bootstrapIntegrationTest('mysql://test_user:test_password@127.0.0.1:3306/secureguard_db', loader),
    /must target only the secureguard_test MySQL database/,
  );
  assert.equal(moduleLoadAttempted, false);

  await assert.rejects(bootstrapIntegrationTest(undefined, loader), /SECUREGUARD_TEST_DATABASE_URL/);
  assert.equal(moduleLoadAttempted, false);
});
