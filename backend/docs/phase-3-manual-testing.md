# SecureGuard Phase 3 manual testing

Use a disposable or staging environment with synthetic records. Do not create test records in a production database. Client and site creation persist records; plan cleanup through the approved environment's normal retention process.

## Client management

- [ ] Log in as `SUPER_ADMIN` and create a client using a synthetic company name, test email domain, and a generated password that meets the existing 12 character / 72 UTF-8 byte policy.
- [ ] Confirm the client appears in the client list with correct status and site count; open details and verify its profile and latest invoice summaries (if any).
- [ ] Edit client company/contact information and verify the audit log.
- [ ] Change client status with the confirmation dialog. Confirm a deactivated client cannot log in or use protected API endpoints; reactivate it if needed.
- [ ] Log in as that `CLIENT`; verify only its own organization/profile and sites appear. Try another client's identifier and confirm it returns no data (404).

## Site management

- [ ] As `SUPER_ADMIN` or `ADMIN`, create a site for an active synthetic client, optionally assigning an active supervisor.
- [ ] Verify site listing, status, active assignment count, client association, supervisor association, and details.
- [ ] Edit site information and supervisor/client associations; verify assignments and attendance history remain present.
- [ ] Confirm a site with assignments, attendance, or incident history cannot be reassigned to a different client, since the existing schema has no ownership history for past records.
- [ ] Complete or reassign active guard assignments before deactivating a site. Change site status using the confirmation dialog and verify the audit log; completed assignment and attendance history remain intact.
- [ ] Log in as `SUPERVISOR`; verify only sites whose `supervisor_id` matches their supervisor profile are visible. Try another site's identifier and confirm 404.
- [ ] Log in as `GUARD`; verify administrative client/site endpoints are denied.

## Authorization and regression

- [ ] Verify anonymous requests receive 401 and unauthorized role requests receive 403.
- [ ] Verify an inactive client or supervisor cannot be selected for a site.
- [ ] Review audit entries for `CLIENT_CREATED`, `CLIENT_UPDATED`, `CLIENT_STATUS_CHANGED`, `SITE_CREATED`, `SITE_UPDATED`, and `SITE_STATUS_CHANGED`.
- [ ] Verify login, `/api/auth/me`, Employee Management, health endpoint, and existing dashboard navigation still work.
