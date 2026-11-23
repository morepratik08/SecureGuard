import assert from 'node:assert/strict';
import { test } from 'node:test';
import { validateAttendanceListQuery, validateCheckIn } from '../src/validators/attendance.validator.js';
import { validateLeaveDecisionBody, validateLeaveInput, validateLeaveListQuery } from '../src/validators/leave.validator.js';
import { durationMinutesForTesting } from '../src/services/attendance.service.js';
import { approvedLeaveOverlaps } from '../src/services/leave.service.js';

test('attendance validators require a scoped assignment ID and schema-supported filters', () => {
  assert.equal(validateCheckIn({ assignment_id: '9007199254740993' }).assignmentId, 9007199254740993n);
  assert.throws(() => validateCheckIn({ assignment_id: '12', guard_id: '34' }), (error) => error.statusCode === 400);
  assert.throws(() => validateCheckIn({ assignment_id: '0' }), (error) => error.statusCode === 400);
  assert.equal(validateAttendanceListQuery({ status: 'LATE', page: '2' }).page, 2);
  assert.throws(() => validateAttendanceListQuery({ status: 'VERIFIED' }), (error) => error.statusCode === 400);
});

test('leave validators enforce date order, a nonempty reason, and existing decision fields', () => {
  const value = validateLeaveInput({ start_date: '2026-12-01', end_date: '2026-12-03', reason: ' Family care ' });
  assert.equal(value.reason, 'Family care');
  assert.throws(() => validateLeaveInput({ start_date: '2026-12-03', end_date: '2026-12-01', reason: 'Travel' }), (error) => error.statusCode === 400);
  assert.throws(() => validateLeaveInput({ start_date: '2026-12-01', end_date: '2026-12-01', reason: '  ' }), (error) => error.statusCode === 400);
  assert.throws(() => validateLeaveInput({ start_date: '2026-12-01', end_date: '2026-12-01', reason: 'Travel', leave_type: 'CASUAL' }), (error) => error.statusCode === 400);
  assert.equal(validateLeaveListQuery({ status: 'PENDING' }).status, 'PENDING');
  assert.throws(() => validateLeaveDecisionBody({ rejection_reason: 'Not supported' }), (error) => error.statusCode === 400);
});

test('working duration uses actual timestamps and handles overnight checkout', () => {
  assert.equal(durationMinutesForTesting(new Date('2026-11-23T22:00:00Z'), new Date('2026-11-24T06:00:00Z')), 480);
  assert.equal(durationMinutesForTesting(new Date('2026-11-24T06:00:00Z'), new Date('2026-11-24T05:59:00Z')), null);
  assert.equal(durationMinutesForTesting(null, new Date()), null);
});

test('approved leave overlap uses inclusive assignment and leave dates', () => {
  assert.equal(approvedLeaveOverlaps('2026-12-10', '2026-12-12', '2026-12-12', '2026-12-13'), true);
  assert.equal(approvedLeaveOverlaps('2026-12-10', '2026-12-12', '2026-12-13', null), false);
  assert.equal(approvedLeaveOverlaps('2026-12-10', '2026-12-12', '2026-12-11', null), true);
});
