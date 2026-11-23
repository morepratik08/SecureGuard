# SecureGuard Phase 5 manual testing

Use only synthetic accounts and assignments in the dedicated `secureguard_test` database or an approved staging environment. Never test against `secureguard_db`. Attendance, leave, and audit rows created here are persistent; the live integration suite uses run-specific fixtures and cleans only those fixtures.

## Attendance

1. Log in as a synthetic active guard with an active assignment for today. Open **Attendance** and check in. Confirm a `PRESENT` or `LATE` record appears with the assignment's site and shift.
2. Submit check-in again for the same assignment/date. Confirm the request is rejected and only one attendance row exists.
3. Try to check in using another guard's assignment ID. Confirm it returns not found and creates no row.
4. Check out. Confirm the timestamp is recorded and a nonnegative working duration is displayed. Repeat checkout and confirm it is rejected.
5. For an overnight shift, check in on its assigned start date and check out after midnight. Confirm the record retains the shift's attendance date and duration uses both timestamps.
6. Check in after the assigned start time. Confirm status is `LATE`. Arrival time is compared with the shift start; the schema has no grace-period field.
7. After an assigned shift has ended, use the authorized absence-generation endpoint for that date. Confirm missing records become `ABSENT`, approved leave can become `ON_LEAVE`, and a date before shift end is skipped. Run generation again and confirm no duplicate row is created.
8. Seed or identify an already verified synthetic attendance row, run absence generation for that date, and confirm its status, verification, and timestamps remain unchanged.
9. Log in as a supervisor assigned to the attendance site and verify a record. Confirm `verified_by` is set, check-in/out timestamps remain unchanged, and a second verification is rejected. Try an unrelated site's record and confirm it is hidden.
10. Log in as a guard and confirm attendance lists/details show only personal records. Log in as a client and confirm attendance and leave endpoints are denied.
11. Review daily summary and monthly date filters; confirm values come from API records and empty states appear when no records exist.

## Leave

12. Submit a leave request as a guard. Confirm identity is taken from the authenticated account and status is `PENDING`.
13. Submit an overlapping pending request, including one that shares a boundary date. Confirm the duplicate is rejected. A rejected request should not block a later request.
14. Log in as an administrator and approve a pending request. Confirm reviewer and review time are recorded. Try the opposite decision afterward and confirm it is rejected. Repeat with rejection.
15. Attempt to approve leave that overlaps an active assignment. Confirm approval is blocked until the assignment is manually adjusted. No assignment is automatically ended or deleted.
16. After approving leave for an otherwise unassigned guard, try creating an assignment overlapping the approved dates. Confirm it is rejected.
17. A supervisor may view leave requests for guards who have assignments at that supervisor's sites. Because the schema has no leave-to-site relation, this scope is based on guard assignments, not a site-specific leave request.
18. Review audit records for check-in, check-out, verification, absence generation, leave request, approval, and rejection.

## Regression and integration

19. Re-run the Employee, Client, Site, Shift, Guard Allocation, authentication, and health workflows.
20. Run the mocked suite with `npm test`. Run real MySQL tests only from a shell with the dedicated URL already configured:

```powershell
npm run test:phase5:integration
```

The integration suite validates `SECUREGUARD_TEST_DATABASE_URL` before importing Prisma and accepts only the database `secureguard_test`. It does not read `.env`, use `DATABASE_URL` as a fallback, or run schema commands.

## Schema limitations

- `attendance` has timestamps and status, but no persisted work-duration or verification timestamp. Duration is derived from `check_in` and `check_out`; verification time is available from the audit row's `created_at`.
- `leaves` has no leave type or rejection-reason column. Decisions store `reviewed_by`, `reviewed_at`, and the existing status only.
- `leaves` has no direct site or assignment relation. Supervisor visibility is therefore derived from guards with assignments at the supervisor's sites and may include that guard's other leave dates.
- There is no background-job facility in this phase. An administrator or scoped supervisor explicitly invokes absence generation after a shift ends; no absence is created by a read request.
- Approved leave blocks overlapping new assignments. Approval is refused when an active assignment overlaps. Existing assignments are never automatically changed; resolve them through scheduling operations first.
- Site timezone and late grace periods are not represented in the current schema. Attendance date calculations use UTC and lateness is measured against the shift start time.
