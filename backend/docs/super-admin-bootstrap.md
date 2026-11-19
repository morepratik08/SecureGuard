# One-time Super Admin bootstrap

Use this interactive script only when the database does not yet have a `SUPER_ADMIN`. It creates one `users` row with role `SUPER_ADMIN` and `is_active = true`. It does not create a profile row, modify another user, or provide a public registration endpoint.

## Run

From the `backend` directory, with the intended MySQL connection configured in the normal backend environment:

```powershell
npm run bootstrap
```

Enter the full name and email when prompted. Password input is hidden. The password must follow the existing account policy: at least 12 Unicode characters and at most 72 UTF-8 bytes. The email is trimmed and lowercased. The script uses bcrypt with 12 rounds and never prints the password or hash.

The script refuses to proceed if a `SUPER_ADMIN` already exists. It acquires a MySQL named lock on the connection pinned to the Prisma transaction. The lock remains held through commit and is released when the one-shot script disconnects Prisma; a transactional `SELECT ... FOR UPDATE` also checks the role before insertion. Run it against the intended database only; the database connection comes from the backend's configured `DATABASE_URL`. The script does not print that URL or other connection details.

The existing schema's unique email constraint also prevents collision with any other user. If bootstrap reports an error, check whether a Super Admin was created before retrying. Do not repeatedly run it against a production database as a health check.

This command was not run as part of implementation; it has not created an account or connected to MySQL.
