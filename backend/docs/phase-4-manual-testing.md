# SecureGuard Phase 4 manual testing

Use synthetic accounts and sites in a disposable or staging database. These workflows persist shifts and assignments. Do not use production records for testing; clean up only through the approved staging process. Do not delete assignments because they are historical records.

## Shifts

- [ ] Log in as `SUPER_ADMIN` or `ADMIN`, create a shift, and confirm it appears in the shift list.
- [ ] Edit its name or description and confirm the update and `SHIFT_UPDATED` audit entry.
- [ ] Try malformed times and an equal start/end time; confirm validation rejects them.
- [ ] Try an overnight shift (for example 22:00–06:00) and confirm it saves.
- [ ] Assign the shift, then try changing its times or deactivating it. Confirm the API rejects changes that could alter active or historical scheduling semantics.

## Guard allocation

- [ ] Assign an active synthetic guard, active site, and active shift for a date range. Confirm the assignment appears in the assignment list and calendar.
- [ ] Try an inactive/terminated/leave guard, inactive site, inactive shift, or nonexistent profile; each must be rejected.
- [ ] Try a daytime overlap, a cross-midnight overlap, and an overnight overlap. Confirm overlapping active periods are rejected.
- [ ] Try adjacent shifts (for example 08:00–16:00 and 16:00–22:00) on the same date; confirm they are accepted.
- [ ] Change an active assignment’s date, site, or shift and confirm the overlap check is repeated.
- [ ] End the assignment. Confirm status becomes `COMPLETED`, end date is recorded, the row remains visible in history, and `ASSIGNMENT_ENDED` is audited.

## Calendar, scope, and audit

- [ ] Switch between daily and weekly calendar ranges, navigate dates, and filter by site, guard, shift, and assignment status.
- [ ] Log in as a supervisor and verify only sites assigned to their supervisor profile and guards allocated there are visible. Try an unrelated assignment ID and expect 404.
- [ ] Verify only admins can create, edit, end assignments, or modify shifts. Anonymous requests should receive 401; unauthorized roles should receive 403.
- [ ] Review audit entries for shift creation/update/status and assignment creation/update/end.
- [ ] Verify Employee, Client, Site, authentication, and health functionality still works.

## Important schema limits

- The `shifts` table has no break-duration field; the UI/API do not collect or invent one.
- Assignments have date-only start/end values and refer to a shift. Active shifts recur each day in that range. Exact-time overlap is evaluated using the assigned shift times, including overnight shifts.
- Shift time changes are blocked once any assignment references the shift because the schema has no historical shift-time snapshot.
- Deactivating a site or shift is blocked while active assignments reference it. Client changes for sites with operational history are also blocked by the Phase 3 service.
- Concurrent allocation protection locks the existing guard profile row and uses MySQL `FOR UPDATE` reads inside the same transaction. This is designed for MySQL/InnoDB; validate with simultaneous requests against a disposable MySQL database before production use. Stub tests do not prove race-free behavior on a live server.

## Opt-in live MySQL integration suite

The live Phase 4 suite is separate from `npm test` and uses the existing integration URL guard. Set `SECUREGUARD_TEST_DATABASE_URL` in the current shell to a MySQL URL whose database path is exactly `secureguard_test`, then run from `backend`:

```powershell
$env:SECUREGUARD_TEST_DATABASE_URL = 'mysql://TEST_USER:URL_ENCODED_TEST_PASSWORD@127.0.0.1:3306/secureguard_test'
npm run test:phase4:integration
Remove-Item Env:SECUREGUARD_TEST_DATABASE_URL -ErrorAction SilentlyContinue
```

The test verifies the participating tables use InnoDB, creates uniquely named synthetic users/profiles/sites/shifts, and removes only rows associated with those run-specific fixtures. It includes a pair of simultaneous HTTP allocation requests and checks the committed assignment rows through Prisma/MySQL after both requests finish. The existing schema must already be initialized in `secureguard_test`; the test does not run migrations or schema commands. It rejects other database names before importing Prisma and never loads `.env` or uses `DATABASE_URL` as a fallback. These live tests are distinct from `node test/phase4.test.js`, which uses Prisma stubs and does not establish database concurrency behavior.
