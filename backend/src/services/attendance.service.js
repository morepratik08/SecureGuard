import prisma from '../config/prisma.js';
import { HttpError } from '../utils/http-error.js';
import { parseAccountId } from '../validators/account.validator.js';

const DAY_MS = 86_400_000;
const ADMIN_ROLES = new Set(['ADMIN', 'SUPER_ADMIN']);

function dateText(value) {
  return value instanceof Date ? value.toISOString().slice(0, 10) : String(value).slice(0, 10);
}
function timeText(value) {
  if (typeof value === 'string') return value.slice(0, 8);
  return value instanceof Date && !Number.isNaN(value.getTime()) ? value.toISOString().slice(11, 19) : null;
}
function dateAt(date, time) { return new Date(`${dateText(date)}T${timeText(time)}Z`); }
function dateOnly(value) { return new Date(`${value}T00:00:00.000Z`); }
function addDays(value, count) {
  const date = dateOnly(value);
  date.setUTCDate(date.getUTCDate() + count);
  return date.toISOString().slice(0, 10);
}
function minutes(value) {
  const [hours, mins, seconds = '00'] = value.split(':');
  return Number(hours) * 60 + Number(mins) + Number(seconds) / 60;
}
function databaseBooleanIsTrue(value) { return value === true || value === 1 || value === 1n; }
function shiftBounds(attendanceDate, startTime, endTime) {
  const start = dateAt(attendanceDate, startTime);
  let end = dateAt(attendanceDate, endTime);
  if (end.getTime() === start.getTime()) throw new HttpError(409, 'A zero-length shift cannot be used for attendance.');
  if (end <= start) end = new Date(end.getTime() + DAY_MS);
  return { start, end };
}
function assignmentCoversDate(assignment, value) {
  const start = dateText(assignment.start_date);
  const end = assignment.end_date == null ? null : dateText(assignment.end_date);
  return start <= value && (end === null || end >= value);
}
function currentAttendanceDate(assignment, startTime, endTime, now) {
  const today = now.toISOString().slice(0, 10);
  const currentMinute = now.getUTCHours() * 60 + now.getUTCMinutes();
  const startMinute = minutes(startTime);
  const endMinute = minutes(endTime);
  const isOvernight = endMinute <= startMinute;
  let candidate = isOvernight && currentMinute < endMinute ? addDays(today, -1) : today;
  if (!assignmentCoversDate(assignment, candidate) && candidate !== today && assignmentCoversDate(assignment, today)) candidate = today;
  if (!assignmentCoversDate(assignment, candidate)) return null;
  return candidate;
}
function minutesWorked(checkIn, checkOut) {
  if (!checkIn || !checkOut) return null;
  const duration = Math.floor((checkOut.getTime() - checkIn.getTime()) / 60_000);
  return duration >= 0 ? duration : null;
}
function safeAttendance(row) {
  const checkIn = row.check_in ?? null;
  const checkOut = row.check_out ?? null;
  return {
    id: row.id.toString(),
    assignment_id: row.assignment_id.toString(),
    attendance_date: dateText(row.attendance_date),
    check_in: checkIn?.toISOString() ?? null,
    check_out: checkOut?.toISOString() ?? null,
    working_duration_minutes: minutesWorked(checkIn, checkOut),
    status: row.status ?? 'PRESENT',
    verified: row.verified_by !== null,
    verified_by: row.supervisors ? {
      id: row.supervisors.users.id.toString(),
      profile_id: row.supervisors.id.toString(),
      name: row.supervisors.users.name,
    } : null,
    guard: {
      id: row.guards.users.id.toString(),
      profile_id: row.guards.id.toString(),
      name: row.guards.users.name,
      employee_code: row.guards.employee_code,
    },
    site: { id: row.sites.id.toString(), site_name: row.sites.site_name },
    shift: {
      id: row.assignments.shifts.id.toString(),
      shift_name: row.assignments.shifts.shift_name,
      start_time: timeText(row.assignments.shifts.start_time),
      end_time: timeText(row.assignments.shifts.end_time),
    },
  };
}
function safeLeaveSummary(row) {
  return {
    id: row.id.toString(), start_date: dateText(row.start_date), end_date: dateText(row.end_date),
    reason: row.reason, status: row.status ?? 'PENDING',
    reviewed_at: row.reviewed_at?.toISOString() ?? null, created_at: row.created_at?.toISOString() ?? null,
  };
}

const attendanceInclude = {
  guards: { select: { id: true, employee_code: true, users: { select: { id: true, name: true } } } },
  sites: { select: { id: true, site_name: true, supervisor_id: true } },
  assignments: { select: { shifts: { select: { id: true, shift_name: true, start_time: true, end_time: true } } } },
  supervisors: { select: { id: true, users: { select: { id: true, name: true } } } },
};

async function guardProfile(userId) {
  const guard = await prisma.guards.findUnique({
    where: { user_id: BigInt(userId) },
    select: { id: true, employment_status: true },
  });
  if (!guard) throw new HttpError(403, 'Guard profile is required.');
  return guard;
}

async function supervisorProfile(userId) {
  const supervisor = await prisma.supervisors.findUnique({
    where: { user_id: BigInt(userId) }, select: { id: true },
  });
  if (!supervisor) throw new HttpError(403, 'Supervisor profile is required.');
  return supervisor;
}

async function actorScope(actor) {
  if (ADMIN_ROLES.has(actor.role)) return {};
  if (actor.role === 'GUARD') return { guard_id: (await guardProfile(actor.id)).id };
  if (actor.role === 'SUPERVISOR') {
    const supervisor = await supervisorProfile(actor.id);
    return { sites: { is: { supervisor_id: supervisor.id } } };
  }
  throw new HttpError(403, 'You are not authorized to access attendance.');
}

function attendanceWhere(filters, scope) {
  return {
    ...scope,
    ...(filters.guardId ? { guard_id: filters.guardId } : {}),
    ...(filters.siteId ? { site_id: filters.siteId } : {}),
    ...(filters.status ? { status: filters.status } : {}),
    ...(filters.shiftId ? { assignments: { is: { shift_id: filters.shiftId } } } : {}),
    ...(filters.from || filters.to ? { attendance_date: {
      ...(filters.from ? { gte: filters.from } : {}),
      ...(filters.to ? { lte: filters.to } : {}),
    } } : {}),
    ...(filters.search ? { guards: { is: { OR: [
      { employee_code: { contains: filters.search } },
      { users: { is: { name: { contains: filters.search } } } },
    ] } } } : {}),
  };
}
function pagination(filters, total) {
  return { page: filters.page, pageSize: filters.pageSize, total, totalPages: Math.ceil(total / filters.pageSize) };
}

export async function checkIn({ userId, assignmentId }) {
  const actorId = BigInt(userId);
  const guard = await guardProfile(userId);
  if (guard.employment_status !== 'ACTIVE') throw new HttpError(403, 'Only active guards can check in.');
  let createdId;
  try {
    await prisma.$transaction(async (tx) => {
      const guardRows = await tx.$queryRaw`
        SELECT g.id, g.employment_status, u.role, u.is_active
        FROM guards g JOIN users u ON u.id = g.user_id
        WHERE g.id = ${guard.id} FOR UPDATE
      `;
      const currentGuard = guardRows[0];
      if (!currentGuard || currentGuard.role !== 'GUARD' || !databaseBooleanIsTrue(currentGuard.is_active)
        || currentGuard.employment_status !== 'ACTIVE') throw new HttpError(403, 'Only active guards can check in.');
      const rows = await tx.$queryRaw`
        SELECT a.id, a.guard_id, a.site_id, a.shift_id, a.start_date, a.end_date, a.status,
          TIME_FORMAT(s.start_time, '%H:%i:%s') AS start_time,
          TIME_FORMAT(s.end_time, '%H:%i:%s') AS end_time
        FROM assignments a JOIN shifts s ON s.id = a.shift_id
        WHERE a.id = ${assignmentId} AND a.guard_id = ${guard.id} FOR UPDATE
      `;
      const assignment = rows[0];
      if (!assignment || assignment.status !== 'ACTIVE') throw new HttpError(404, 'Active assignment not found.');

      const now = new Date();
      const attendanceDate = currentAttendanceDate(assignment, assignment.start_time, assignment.end_time, now);
      if (!attendanceDate) throw new HttpError(409, 'The assignment is not active for the current attendance date.');
      const approvedLeave = await tx.leaves.findFirst({
        where: { guard_id: guard.id, status: 'APPROVED', start_date: { lte: dateOnly(attendanceDate) }, end_date: { gte: dateOnly(attendanceDate) } },
        select: { id: true },
      });
      if (approvedLeave) throw new HttpError(409, 'Check-in is unavailable during approved leave.');
      const bounds = shiftBounds(attendanceDate, assignment.start_time, assignment.end_time);
      if (now >= bounds.end) throw new HttpError(409, 'Check-in is closed because this shift has ended.');

      const duplicate = await tx.attendance.findFirst({
        where: { assignment_id: assignment.id, attendance_date: dateOnly(attendanceDate) }, select: { id: true },
      });
      if (duplicate) throw new HttpError(409, 'Attendance has already been checked in for this assignment and date.');

      const status = now > bounds.start ? 'LATE' : 'PRESENT';
      const row = await tx.attendance.create({ data: {
        assignment_id: assignment.id,
        guard_id: guard.id,
        site_id: assignment.site_id,
        attendance_date: dateOnly(attendanceDate),
        check_in: now,
        status,
      }, select: { id: true } });
      createdId = row.id;
      await tx.audit_logs.create({ data: {
        user_id: actorId, action: 'ATTENDANCE_CHECK_IN', entity_type: 'ATTENDANCE', entity_id: row.id,
        details: { assignment_id: assignment.id.toString(), attendance_date: attendanceDate, status },
      } });
    });
  } catch (error) {
    if (error?.code === 'P2002') throw new HttpError(409, 'Attendance has already been checked in for this assignment and date.');
    throw error;
  }
  return getAttendance({ id: userId, role: 'GUARD' }, createdId.toString());
}

export async function checkOut({ userId, attendanceId }) {
  const id = parseAccountId(String(attendanceId));
  if (!id) throw new HttpError(400, 'A valid attendance ID is required.');
  const guard = await guardProfile(userId);
  const actorId = BigInt(userId);
  const now = new Date();
  await prisma.$transaction(async (tx) => {
    const rows = await tx.$queryRaw`
      SELECT id, guard_id, check_in, check_out
      FROM attendance WHERE id = ${id} AND guard_id = ${guard.id} FOR UPDATE
    `;
    const attendance = rows[0];
    if (!attendance) throw new HttpError(404, 'Attendance record not found.');
    if (!attendance.check_in) throw new HttpError(409, 'Attendance has no check-in to close.');
    if (attendance.check_out) throw new HttpError(409, 'Attendance has already been checked out.');
    if (now.getTime() < new Date(attendance.check_in).getTime()) throw new HttpError(409, 'Check-out time cannot precede check-in.');
    const updated = await tx.attendance.updateMany({ where: { id, guard_id: guard.id, check_out: null }, data: { check_out: now } });
    if (updated.count !== 1) throw new HttpError(409, 'Attendance was already checked out.');
    await tx.audit_logs.create({ data: {
      user_id: actorId, action: 'ATTENDANCE_CHECK_OUT', entity_type: 'ATTENDANCE', entity_id: id,
      details: { attendance_date: dateText(attendance.attendance_date) },
    } });
  });
  return getAttendance({ id: userId, role: 'GUARD' }, id.toString());
}

export async function listAttendance(actor, filters) {
  const where = attendanceWhere(filters, await actorScope(actor));
  const [rows, total] = await Promise.all([
    prisma.attendance.findMany({ where, orderBy: [{ attendance_date: 'desc' }, { id: 'desc' }], skip: (filters.page - 1) * filters.pageSize, take: filters.pageSize, include: attendanceInclude }),
    prisma.attendance.count({ where }),
  ]);
  return { attendance: rows.map(safeAttendance), pagination: pagination(filters, total) };
}

export async function getAttendance(actor, value) {
  const id = parseAccountId(String(value));
  if (!id) throw new HttpError(400, 'A valid attendance ID is required.');
  const row = await prisma.attendance.findFirst({ where: { id, ...(await actorScope(actor)) }, include: attendanceInclude });
  if (!row) throw new HttpError(404, 'Attendance record not found.');
  return safeAttendance(row);
}

export async function verifyAttendance({ actorId, attendanceId }) {
  const id = parseAccountId(String(attendanceId));
  if (!id) throw new HttpError(400, 'A valid attendance ID is required.');
  const supervisor = await supervisorProfile(actorId);
  await prisma.$transaction(async (tx) => {
    const rows = await tx.$queryRaw`
      SELECT a.id, a.verified_by, a.status
      FROM attendance a JOIN sites s ON s.id = a.site_id
      WHERE a.id = ${id} AND s.supervisor_id = ${supervisor.id} FOR UPDATE
    `;
    const row = rows[0];
    if (!row) throw new HttpError(404, 'Attendance record not found.');
    if (row.verified_by !== null) throw new HttpError(409, 'Attendance has already been verified.');
    const changed = await tx.attendance.updateMany({ where: { id, verified_by: null }, data: { verified_by: supervisor.id } });
    if (changed.count !== 1) throw new HttpError(409, 'Attendance has already been verified.');
    await tx.audit_logs.create({ data: {
      user_id: BigInt(actorId), action: 'ATTENDANCE_VERIFIED', entity_type: 'ATTENDANCE', entity_id: id,
      details: { status: row.status ?? 'PRESENT' },
    } });
  });
  return getAttendance({ id: actorId, role: 'SUPERVISOR' }, id.toString());
}

export async function generateAbsences({ actor, attendanceDate }) {
  const requestedDate = dateText(attendanceDate);
  const today = new Date().toISOString().slice(0, 10);
  if (requestedDate > today) throw new HttpError(400, 'Cannot generate attendance for a future date.');
  const supervisor = actor.role === 'SUPERVISOR' ? await supervisorProfile(actor.id) : null;
  const actorId = BigInt(actor.id);
  return prisma.$transaction(async (tx) => {
    const assignments = supervisor
      ? await tx.$queryRaw`
        SELECT a.id, a.guard_id, a.site_id, a.start_date, a.end_date,
          TIME_FORMAT(s.start_time, '%H:%i:%s') AS start_time,
          TIME_FORMAT(s.end_time, '%H:%i:%s') AS end_time
        FROM assignments a JOIN shifts s ON s.id = a.shift_id JOIN sites t ON t.id = a.site_id
        WHERE a.status = 'ACTIVE' AND a.start_date <= ${requestedDate}
          AND (a.end_date IS NULL OR a.end_date >= ${requestedDate}) AND t.supervisor_id = ${supervisor.id}
        ORDER BY a.id FOR UPDATE
      `
      : await tx.$queryRaw`
        SELECT a.id, a.guard_id, a.site_id, a.start_date, a.end_date,
          TIME_FORMAT(s.start_time, '%H:%i:%s') AS start_time,
          TIME_FORMAT(s.end_time, '%H:%i:%s') AS end_time
        FROM assignments a JOIN shifts s ON s.id = a.shift_id
        WHERE a.status = 'ACTIVE' AND a.start_date <= ${requestedDate}
          AND (a.end_date IS NULL OR a.end_date >= ${requestedDate})
        ORDER BY a.id FOR UPDATE
      `;
    const now = new Date();
    let created = 0;
    let skippedBeforeShiftEnd = 0;
    let skippedExisting = 0;
    for (const assignment of assignments) {
      const { end } = shiftBounds(requestedDate, assignment.start_time, assignment.end_time);
      if (now < end) { skippedBeforeShiftEnd += 1; continue; }
      const previous = await tx.attendance.findFirst({
        where: { assignment_id: assignment.id, attendance_date: dateOnly(requestedDate) }, select: { id: true },
      });
      if (previous) { skippedExisting += 1; continue; }
      const approvedLeave = await tx.leaves.findFirst({
        where: { guard_id: assignment.guard_id, status: 'APPROVED', start_date: { lte: dateOnly(requestedDate) }, end_date: { gte: dateOnly(requestedDate) } },
        select: { id: true },
      });
      try {
        const row = await tx.attendance.create({ data: {
          assignment_id: assignment.id, guard_id: assignment.guard_id, site_id: assignment.site_id,
          attendance_date: dateOnly(requestedDate), status: approvedLeave ? 'ON_LEAVE' : 'ABSENT',
        }, select: { id: true } });
        await tx.audit_logs.create({ data: {
          user_id: actorId, action: approvedLeave ? 'ATTENDANCE_ON_LEAVE_RECORDED' : 'ATTENDANCE_ABSENCE_RECORDED',
          entity_type: 'ATTENDANCE', entity_id: row.id,
          details: { assignment_id: assignment.id.toString(), attendance_date: requestedDate },
        } });
        created += 1;
      } catch (error) {
        if (error?.code === 'P2002') { skippedExisting += 1; continue; }
        throw error;
      }
    }
    return { date: requestedDate, created, skipped_existing: skippedExisting, skipped_before_shift_end: skippedBeforeShiftEnd };
  });
}

export async function attendanceDashboard(actor) {
  const today = new Date().toISOString().slice(0, 10);
  const date = dateOnly(today);
  if (actor.role === 'GUARD') {
    const guard = await guardProfile(actor.id);
    const [records, assignments, leaves] = await Promise.all([
      prisma.attendance.findMany({ where: { guard_id: guard.id, attendance_date: date }, orderBy: { id: 'desc' }, include: attendanceInclude }),
      prisma.assignments.findMany({
        where: { guard_id: guard.id, status: 'ACTIVE', start_date: { lte: date }, OR: [{ end_date: null }, { end_date: { gte: date } }] },
        include: { sites: { select: { id: true, site_name: true } }, shifts: { select: { id: true, shift_name: true, start_time: true, end_time: true } } },
      }),
      prisma.leaves.findMany({ where: { guard_id: guard.id, status: { in: ['PENDING', 'APPROVED'] } }, orderBy: { created_at: 'desc' }, take: 5 }),
    ]);
    return {
      role: actor.role,
      today: {
        assignments: assignments.map((row) => ({ id: row.id.toString(), site: { id: row.sites.id.toString(), name: row.sites.site_name }, shift: { id: row.shifts.id.toString(), name: row.shifts.shift_name, start_time: timeText(row.shifts.start_time), end_time: timeText(row.shifts.end_time) } })),
        attendance: records.map(safeAttendance),
      },
      leave_requests: leaves.map(safeLeaveSummary),
      personal_summary: await prisma.attendance.groupBy({ by: ['status'], where: { guard_id: guard.id }, _count: { _all: true } }),
    };
  }
  const scope = await actorScope(actor);
  const supervisor = actor.role === 'SUPERVISOR' ? await supervisorProfile(actor.id) : null;
  const scopedGuardIds = supervisor
    ? [...new Set((await prisma.assignments.findMany({ where: { sites: { is: { supervisor_id: supervisor.id } } }, select: { guard_id: true } })).map((row) => row.guard_id))]
    : null;
  const attendanceFilter = attendanceWhere({ from: date, to: date }, scope);
  const [present, late, absent, onLeave, pendingLeaves, pendingVerification] = await Promise.all([
    prisma.attendance.count({ where: { ...attendanceFilter, status: 'PRESENT' } }),
    prisma.attendance.count({ where: { ...attendanceFilter, status: 'LATE' } }),
    prisma.attendance.count({ where: { ...attendanceFilter, status: 'ABSENT' } }),
    prisma.attendance.count({ where: { ...attendanceFilter, status: 'ON_LEAVE' } }),
    prisma.leaves.count({ where: {
      status: 'PENDING',
      ...(supervisor ? { guard_id: { in: scopedGuardIds } } : {}),
    } }),
    supervisor
      ? prisma.attendance.count({ where: { ...attendanceFilter, verified_by: null } })
      : Promise.resolve(0),
  ]);
  return { role: actor.role, date: today, present, late, absent, on_leave: onLeave, pending_leaves: pendingLeaves, pending_verification: pendingVerification, total: present + late + absent + onLeave };
}

export function durationMinutesForTesting(checkIn, checkOut) { return minutesWorked(checkIn, checkOut); }
