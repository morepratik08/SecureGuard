# SecureGuard Phase 6 manual testing

Use only synthetic accounts and sites in the dedicated `secureguard_test` database or an approved staging environment. Never use `secureguard_db`. The current schema is unchanged.

## Incident management

1. Sign in as an administrator and report an incident for an active site. Confirm the reporter comes from the authenticated account, the status starts at `OPEN`, and severity matches one of `LOW`, `MEDIUM`, `HIGH`, or `CRITICAL`.
2. Try submitting `reported_by`, an unsupported status, an unknown severity, an invalid site ID, or a date-time without a timezone. Confirm validation rejects the request.
3. Sign in as a supervisor and confirm the site picker and list show only supervised sites and their incidents. Try loading a different site's incident directly; it should return not found. Confirm status changes on in-scope incidents work.
4. Sign in as a guard. Confirm only active assigned sites can be selected for reporting, and the guard can see only incidents they reported. Try reporting at an unassigned site.
5. Sign in as a client. Confirm only the client's sites and incidents are visible. Try accessing another client's incident directly.
6. As admin or the in-scope supervisor, advance an incident through `OPEN` → `INVESTIGATING` → `RESOLVED` → `CLOSED`. Attempt to skip a state or reopen a closed record; confirm the transition is rejected.
7. Edit title, description, severity, or incident time. Confirm the reporter and site cannot be changed through the update API.
8. Inspect the incident history. Confirm report, metadata update, and status change entries contain actor and time, and no unrelated employee details.
9. Filter by site, date range, status, severity, and search. Compare role-scoped dashboard counts with visible records.

## Document metadata and storage limits

The current `documents` schema has `guard_id`, `document_type`, `file_url`, `verification_status`, and `uploaded_at`. It has no expiry date or archive field. Cloudinary credentials and upload dependencies were not configured during implementation. Therefore the application does not create fake document records, does not accept user-supplied URLs, withholds existing `file_url` values, and returns HTTP 503 for upload/download until a private storage provider is configured.

10. As admin, supervisor, and guard, open **Documents**. Confirm each role sees only its permitted scope: all records for admins, guards with assignments at supervised sites for supervisors, and the signed-in guard's records for guards. Confirm no file URL is rendered or returned.
11. As admin, change a document's type. Confirm an audit row is written and the new metadata appears. Confirm non-admin updates are rejected. Verification status remains read-only while the file cannot be reviewed.
12. Try passing `file_url`, an expiry field, and an expiry filter to the API. Confirm all are rejected. The UI should say expiry is not tracked.
13. As admin, try upload and as an authorized viewer try download. Until private storage configuration is deployed, confirm both return the explicit service-unavailable response and no public URL is issued.
14. Client accounts must receive 403 for employee-document endpoints. Try another guard's document ID as a guard and confirm it is hidden.

## Regression and automated checks

15. Verify authentication and `/api/health` (expected HTTP 200).
16. Using synthetic records, verify Employees, Clients, Sites, Shifts, Guard Allocations, Attendance, and Leave Management still work and remain role scoped.
17. Run `npm test` in `backend`, `npm run lint` and `npm run build` in `frontend`.
18. Run real MySQL tests only with `SECUREGUARD_TEST_DATABASE_URL` set to the dedicated `secureguard_test` database. Never fall back to `.env` or `DATABASE_URL`. No Phase 6 live integration test is currently provided.

## Known schema and infrastructure limitations

- Incident statuses/severities follow the existing enums. Incident reporting is scoped to active site ownership/assignment; a guard sees only reports they submitted because incidents do not have a guard relation.
- Incident history is sourced from `audit_logs`; there is no separate incident history table.
- Documents have no expiry date, upload filename, MIME type, file size, archive state, or uploader ID. Expiry calculations and archive/replace operations cannot be implemented accurately with this schema.
- Secure file upload/download is disabled. Configure a private storage provider, server-side type and size validation, authorization, and private delivery before enabling file transfer. Do not expose Cloudinary credentials or return raw public URLs.
- Document metadata rows cannot be created until a real private upload yields a trusted storage reference. Existing metadata can be listed and document type can be administratively updated; verification status remains read-only until authorized file review is available.
- No background job or notification system is present. Expiry reminders are not available.
