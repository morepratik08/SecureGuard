# Super Admin password recovery

This is a manual recovery utility for an existing `SUPER_ADMIN` account. It does not create accounts or change roles. It asks for the account email, confirms that the normalized address belongs to a `SUPER_ADMIN`, and only then prompts for a new password with terminal echo disabled.

## Run

From the `backend` directory in a private interactive terminal, with the intended database configured through the normal backend environment:

```powershell
npm run reset:super-admin
```

The new password follows the shared account policy: at least 12 Unicode characters and at most 72 UTF-8 bytes. It is hashed with bcrypt using 12 rounds. The script updates only the matched user's `password_hash` and `updated_at` fields in a transaction. The timestamp uses the same second-precision auth-version advancement as the password change service, so JWTs issued before recovery fail the next authentication check.

The script rechecks the target and uses a compare-and-swap condition inside the transaction. If the account does not exist, is not a `SUPER_ADMIN`, or changes concurrently, it stops without changing another user. Errors are reported without printing passwords, hashes, connection strings, or database credentials. Prisma is disconnected when the command completes.

Run this utility only when you are authorized to administer the configured database. Verify the account email before entering the new password. Do not send the password through email, chat, logs, or shell command arguments. This implementation task did not run the recovery script or connect to MySQL.
