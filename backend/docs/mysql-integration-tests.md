# Real MySQL authentication integration tests

The integration suite is opt-in and separate from `npm test`. It requires the dedicated `SECUREGUARD_TEST_DATABASE_URL` variable and accepts only a MySQL URL whose database path is exactly `secureguard_test`. It does not load `.env`, read `DATABASE_URL`, or reuse the regular `JWT_SECRET`. Before Prisma or the Express app is imported, the test process validates the dedicated URL, assigns it to Prisma's `DATABASE_URL`, and generates a fresh process-only JWT secret.

The suite creates a run-specific `SUPER_ADMIN` fixture directly because the API intentionally cannot create that role. It exercises provisioning, role checks, login, status restrictions, password changes/resets, MySQL constraints, and transaction rollback. Cleanup is limited to unique per-run test emails and IDs, deletes guard/supervisor/client profiles before users, and removes the bootstrap super admin last. Do not point it at a shared, production, or development database.

## Create the disposable database

Run these SQL statements in MySQL as an administrator only after confirming that `secureguard_test` is a dedicated empty test database. Replace the password placeholder with a new random test-only password; do not use credentials from `.env`.

```sql
CREATE DATABASE secureguard_test CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
CREATE USER 'sg_test'@'localhost' IDENTIFIED BY 'REPLACE_WITH_RANDOM_TEST_PASSWORD';
GRANT ALL PRIVILEGES ON secureguard_test.* TO 'sg_test'@'localhost';
```

From `backend`, set the disposable URL for the current PowerShell session. URL-encode any reserved characters in the password:

```powershell
$env:SECUREGUARD_TEST_DATABASE_URL = 'mysql://sg_test:REPLACE_WITH_URL_ENCODED_PASSWORD@127.0.0.1:3306/secureguard_test'
```

Initialize tables only in that new disposable database. The existing Prisma schema is the source for this initial schema setup; this command is not run by either test suite.

```powershell
$previousDatabaseUrl = $env:DATABASE_URL
try {
    $env:DATABASE_URL = $env:SECUREGUARD_TEST_DATABASE_URL
    npx prisma db push --schema=prisma/schema.prisma
} finally {
    if ($null -eq $previousDatabaseUrl) {
        Remove-Item Env:DATABASE_URL -ErrorAction SilentlyContinue
    } else {
        $env:DATABASE_URL = $previousDatabaseUrl
    }
}
```

## Run tests

```powershell
npm run test:integration:safety
npm run test:integration
```

The first command does not need a database and verifies that missing, malformed, non-MySQL, `secureguard_db`, and other database URLs are rejected before the loader can import Prisma or the application. The second runs those safety tests first, then connects to `secureguard_test`. The test app binds an ephemeral port and uses per-request test IPs so the production login limiter does not make the cases interfere with one another.

When finished, remove only the test-only environment variable from the current shell:

```powershell
Remove-Item Env:SECUREGUARD_TEST_DATABASE_URL -ErrorAction SilentlyContinue
```

The suite cleans its own fixture records. It does not drop the database or user. Remove the disposable database and test user later through your normal MySQL administration process, after confirming they still refer only to test resources.
