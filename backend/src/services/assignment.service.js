import prisma from '../config/prisma.js';
import { HttpError } from '../utils/http-error.js';
import { parseAccountId } from '../validators/account.validator.js';
import { shiftDurationMinutes } from './shift.service.js';

function dayNumber(value) {
  const date = typeof value === 'string' ? new Date(`${value.slice(0, 10)}T00:00:00.000Z`) : value;
  return Math.floor(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()) / 86_400_000);
}
function formatTime(value) {
  if (typeof value === 'string') return value.slice(0, 8);
  return value instanceof Date && !Number.isNaN(value.getTime()) ? value.toISOString().slice(11, 19) : null;
}
function timeMinutes(value) {
  const [hour, minute, second = '00'] = value.split(':');
  return Number(hour) * 60 + Number(minute) + Number(second) / 60;
}
function databaseBooleanIsTrue(value) {
  // MySQL BOOLEAN is TINYINT(1); raw Prisma queries can return it as a number
  // even though model queries expose the same column as a JavaScript boolean.
  return value === true || value === 1 || value === 1n;
}
function interval(shift) {
  const start = timeMinutes(shift.start_time);
  let end = timeMinutes(shift.end_time);
  if (end === start) throw new HttpError(409, 'A zero-length shift cannot be scheduled.');
  if (end < start) end += 1440;
  return { start, end };
}
function rangesOverlap(a, b) {
  const aStart = dayNumber(a.start_date);
  const bStart = dayNumber(b.start_date);
  const aEnd = a.end_date == null ? Number.POSITIVE_INFINITY : dayNumber(a.end_date);
  const bEnd = b.end_date == null ? Number.POSITIVE_INFINITY : dayNumber(b.end_date);
  const aTime = interval(a.shift);
  const bTime = interval(b.shift);
  for (const offset of [-1, 0, 1]) {
    const firstOccurrence = Math.max(aStart, bStart - offset);
    const lastOccurrence = Math.min(aEnd, bEnd - offset);
    if (firstOccurrence > lastOccurrence) continue;
    const shiftedBStart = bTime.start + offset * 1440;
    const shiftedBEnd = bTime.end + offset * 1440;
    if (aTime.start < shiftedBEnd && shiftedBStart < aTime.end) return true;
  }
  return false;
}
function safeAssignment(row) {
  return {
    id: row.id.toString(),
    guard: { id: row.guards.users.id.toString(), profile_id: row.guards.id.toString(), name: row.guards.users.name, employee_code: row.guards.employee_code },
    site: { id: row.sites.id.toString(), site_name: row.sites.site_name, address: row.sites.address, status: row.sites.status ?? 'ACTIVE', client: { id: row.sites.clients.id.toString(), company_name: row.sites.clients.company_name } },
    shift: { id: row.shifts.id.toString(), shift_name: row.shifts.shift_name, start_time: formatTime(row.shifts.start_time), end_time: formatTime(row.shifts.end_time) },
    start_date: row.start_date.toISOString().slice(0, 10),
    end_date: row.end_date?.toISOString().slice(0, 10) ?? null,
    status: row.status ?? 'ACTIVE', created_at: row.created_at?.toISOString() ?? null,
    assigned_by: row.users ? { id: row.users.id.toString(), name: row.users.name } : null,
  };
}
const includeAssignment = {
  guards: { select: { id: true, employee_code: true, users: { select: { id: true, name: true } } } },
  sites: { select: { id: true, site_name: true, address: true, status: true, clients: { select: { id: true, company_name: true } } } },
  shifts: { select: { id: true, shift_name: true, start_time: true, end_time: true } },
  users: { select: { id: true, name: true } },
};
function pageInfo(filters, total) { return { page: filters.page, pageSize: filters.pageSize, total, totalPages: Math.ceil(total / filters.pageSize) }; }

async function supervisorScope(actor) {
  if (actor.role !== 'SUPERVISOR') return {};
  const supervisor = await prisma.supervisors.findUnique({ where: { user_id: BigInt(actor.id) }, select: { id: true } });
  if (!supervisor) throw new HttpError(404, 'Supervisor profile not found.');
  return { sites: { is: { supervisor_id: supervisor.id } } };
}
function queryWhere(filters, scope) {
  return {
    ...scope,
    ...(filters.guardId ? { guard_id: filters.guardId } : {}),
    ...(filters.siteId ? { site_id: filters.siteId } : {}),
    ...(filters.shiftId ? { shift_id: filters.shiftId } : {}),
    ...(filters.status ? { status: filters.status } : {}),
    ...(filters.from || filters.to ? {
      AND: [
        ...(filters.to ? [{ start_date: { lte: filters.to } }] : []),
        ...(filters.from ? [{ OR: [{ end_date: null }, { end_date: { gte: filters.from } }] }] : []),
      ],
    } : {}),
  };
}
export async function listAssignments(actor, filters) {
  const where = queryWhere(filters, await supervisorScope(actor));
  const [rows, total] = await Promise.all([
    prisma.assignments.findMany({ where, orderBy: [{ start_date: 'desc' }, { id: 'desc' }], skip: (filters.page - 1) * filters.pageSize, take: filters.pageSize, include: includeAssignment }),
    prisma.assignments.count({ where }),
  ]);
  return { assignments: rows.map(safeAssignment), pagination: pageInfo(filters, total) };
}
export async function getAssignmentOptions(actor) {
  const scope = await supervisorScope(actor);
  const supervisorId = actor.role === 'SUPERVISOR' ? scope.sites.is.supervisor_id : undefined;
  const [guards, sites, shifts] = await Promise.all([
    prisma.guards.findMany({ where: {
      ...(supervisorId === undefined ? {} : { assignments: { some: { sites: { is: { supervisor_id: supervisorId } } } } }),
      users: { is: { role: 'GUARD' } },
    }, orderBy: { employee_code: 'asc' }, take: 500, select: { id: true, employee_code: true, employment_status: true, users: { select: { id: true, name: true, is_active: true } } } }),
    prisma.sites.findMany({ where: supervisorId === undefined ? {} : { supervisor_id: supervisorId }, orderBy: { site_name: 'asc' }, take: 500, select: { id: true, site_name: true, status: true, clients: { select: { company_name: true } } } }),
    prisma.shifts.findMany({ where: supervisorId === undefined ? {} : { assignments: { some: { sites: { is: { supervisor_id: supervisorId } } } } }, orderBy: [{ start_time: 'asc' }, { shift_name: 'asc' }], take: 100, select: { id: true, shift_name: true, start_time: true, end_time: true, is_active: true } }),
  ]);
  return {
    guards: guards.map((row) => ({ id: row.id.toString(), user_id: row.users.id.toString(), name: row.users.name, employee_code: row.employee_code, employment_status: row.employment_status, is_active: row.users.is_active === true, is_eligible: row.employment_status === 'ACTIVE' && row.users.is_active === true })),
    sites: sites.map((row) => ({ id: row.id.toString(), site_name: row.site_name, client_name: row.clients.company_name, is_active: row.status === 'ACTIVE' })),
    shifts: shifts.map((row) => ({ id: row.id.toString(), shift_name: row.shift_name, start_time: formatTime(row.start_time), end_time: formatTime(row.end_time), is_active: row.is_active === true })),
  };
}
export async function getAssignment(actor, value) {
  const id = parseAccountId(value);
  if (!id) throw new HttpError(400, 'A valid assignment ID is required.');
  const row = await prisma.assignments.findFirst({ where: { id, ...(await supervisorScope(actor)) }, include: includeAssignment });
  if (!row) throw new HttpError(404, 'Assignment not found.');
  return safeAssignment(row);
}

async function lockGuardAndCheck(tx, guardId, { requireEligible = true } = {}) {
  const guards = await tx.$queryRaw`
    SELECT g.id, g.employment_status, u.is_active, u.role
    FROM guards g JOIN users u ON u.id = g.user_id
    WHERE g.id = ${guardId} FOR UPDATE
  `;
  const guard = guards[0];
  if (!guard || (requireEligible && (guard.role !== 'GUARD' || !databaseBooleanIsTrue(guard.is_active) || guard.employment_status !== 'ACTIVE'))) {
    throw new HttpError(400, 'The selected guard is not eligible for deployment.');
  }
}
async function lockSiteAndShiftAndCheck(tx, { siteId, shiftId }) {
  const sites = await tx.$queryRaw`SELECT id, status FROM sites WHERE id = ${siteId} FOR UPDATE`;
  if (!sites[0] || sites[0].status !== 'ACTIVE') throw new HttpError(400, 'The selected site is not active.');
  const shifts = await tx.$queryRaw`SELECT id, is_active, start_time, end_time FROM shifts WHERE id = ${shiftId} FOR UPDATE`;
  const shift = shifts[0];
  if (!shift || !databaseBooleanIsTrue(shift.is_active)) throw new HttpError(400, 'The selected shift is not active.');
  const currentShift = { start_time: formatTime(shift.start_time), end_time: formatTime(shift.end_time) };
  if (shiftDurationMinutes(currentShift) <= 0) throw new HttpError(400, 'The selected shift has invalid times.');
  return currentShift;
}

async function activeAssignmentsForUpdate(tx, guardId) {
  // Locking read (not a repeatable-read snapshot) is paired with the guard-row lock.
  // Competing requests for this guard serialize, then observe the prior committed insert.
  return tx.$queryRaw`
    SELECT a.id, DATE_FORMAT(a.start_date, '%Y-%m-%d') AS start_date,
      DATE_FORMAT(a.end_date, '%Y-%m-%d') AS end_date,
      TIME_FORMAT(s.start_time, '%H:%i:%s') AS start_time,
      TIME_FORMAT(s.end_time, '%H:%i:%s') AS end_time,
      a.site_id, a.shift_id
    FROM assignments a JOIN shifts s ON s.id = a.shift_id
    WHERE a.guard_id = ${guardId} AND a.status = 'ACTIVE'
    ORDER BY a.start_date, a.id FOR UPDATE
  `;
}
function assertNoConflict(existingRows, candidate, excludeId) {
  for (const row of existingRows) {
    if (excludeId !== undefined && row.id === excludeId) continue;
    const existing = { start_date: row.start_date, end_date: row.end_date, shift: { start_time: row.start_time, end_time: row.end_time } };
    if (rangesOverlap(candidate, existing)) throw new HttpError(409, 'The guard already has an overlapping active assignment.');
  }
}
function mapRelationError(error) {
  if (error?.code === 'P2003' || error?.code === 'P2025') throw new HttpError(400, 'The selected guard, site, or shift is no longer available.');
  throw error;
}

export async function createAssignment({ actorId, input }) {
  try {
    const created = await prisma.$transaction(async (tx) => {
      await lockGuardAndCheck(tx, input.guard_id);
      const shift = await lockSiteAndShiftAndCheck(tx, { siteId: input.site_id, shiftId: input.shift_id });
      const candidate = { start_date: input.start_date, end_date: input.end_date, shift };
      assertNoConflict(await activeAssignmentsForUpdate(tx, input.guard_id), candidate);
      const assignment = await tx.assignments.create({ data: {
        guard_id: input.guard_id, site_id: input.site_id, shift_id: input.shift_id,
        assigned_by: BigInt(actorId), start_date: input.start_date, end_date: input.end_date, status: 'ACTIVE',
      } });
      await tx.audit_logs.create({ data: { user_id: BigInt(actorId), action: 'ASSIGNMENT_CREATED', entity_type: 'ASSIGNMENT', entity_id: assignment.id, details: { guard_id: input.guard_id.toString(), site_id: input.site_id.toString(), shift_id: input.shift_id.toString() } } });
      return assignment;
    });
    return getAssignment({ role: 'ADMIN', id: actorId }, created.id.toString());
  } catch (error) { mapRelationError(error); }
}

export async function updateAssignment({ actorId, assignmentId, input }) {
  const id = parseAccountId(assignmentId);
  if (!id) throw new HttpError(400, 'A valid assignment ID is required.');
  try {
    await prisma.$transaction(async (tx) => {
      const initial = await tx.assignments.findUnique({ where: { id }, select: { id: true, guard_id: true } });
      if (!initial) throw new HttpError(404, 'Assignment not found.');
      const guardId = initial.guard_id;
      await lockGuardAndCheck(tx, guardId);
      const currentRows = await tx.$queryRaw`
        SELECT id, site_id, shift_id, start_date, end_date, status
        FROM assignments WHERE id = ${id} AND guard_id = ${guardId} FOR UPDATE
      `;
      const current = currentRows[0];
      if (!current) throw new HttpError(404, 'Assignment not found.');
      if (current.status !== 'ACTIVE') throw new HttpError(409, 'Only active assignments can be edited.');
      const siteId = input.site_id ?? current.site_id;
      const shiftId = input.shift_id ?? current.shift_id;
      const startDate = input.start_date ?? current.start_date;
      const endDate = Object.hasOwn(input, 'end_date') ? input.end_date : current.end_date;
      if (endDate && endDate < startDate) throw new HttpError(400, 'End date must be on or after start date.');
      const shift = await lockSiteAndShiftAndCheck(tx, { siteId, shiftId });
      const conflicts = await activeAssignmentsForUpdate(tx, guardId);
      assertNoConflict(conflicts, { start_date: startDate, end_date: endDate, shift }, id);
      await tx.assignments.update({ where: { id }, data: { ...input, site_id: siteId, shift_id: shiftId, start_date: startDate, end_date: endDate } });
      await tx.audit_logs.create({ data: { user_id: BigInt(actorId), action: 'ASSIGNMENT_UPDATED', entity_type: 'ASSIGNMENT', entity_id: id, details: { changedFields: Object.keys(input).sort() } } });
    });
  } catch (error) { mapRelationError(error); }
  return getAssignment({ role: 'ADMIN', id: actorId }, id.toString());
}

export async function endAssignment({ actorId, assignmentId, endDate }) {
  const id = parseAccountId(assignmentId);
  if (!id) throw new HttpError(400, 'A valid assignment ID is required.');
  await prisma.$transaction(async (tx) => {
    const initial = await tx.assignments.findUnique({ where: { id }, select: { id: true, guard_id: true } });
    if (!initial) throw new HttpError(404, 'Assignment not found.');
    await lockGuardAndCheck(tx, initial.guard_id, { requireEligible: false });
    const currentRows = await tx.$queryRaw`SELECT id, start_date, status FROM assignments WHERE id = ${id} AND guard_id = ${initial.guard_id} FOR UPDATE`;
    const current = currentRows[0];
    if (!current) throw new HttpError(404, 'Assignment not found.');
    if (current.status !== 'ACTIVE') throw new HttpError(409, 'Only active assignments can be ended.');
    if (endDate < current.start_date) throw new HttpError(400, 'End date must be on or after assignment start date.');
    if (endDate > new Date(`${new Date().toISOString().slice(0, 10)}T00:00:00.000Z`)) throw new HttpError(400, 'End date cannot be in the future.');
    await tx.assignments.update({ where: { id }, data: { end_date: endDate, status: 'COMPLETED' } });
    await tx.audit_logs.create({ data: { user_id: BigInt(actorId), action: 'ASSIGNMENT_ENDED', entity_type: 'ASSIGNMENT', entity_id: id, details: { end_date: endDate.toISOString().slice(0, 10) } } });
  });
  return getAssignment({ role: 'ADMIN', id: actorId }, id.toString());
}

export async function schedule(actor, filters) {
  const where = queryWhere(filters, await supervisorScope(actor));
  const [rows, total] = await Promise.all([
    prisma.assignments.findMany({ where, orderBy: [{ start_date: 'asc' }, { id: 'asc' }], skip: (filters.page - 1) * filters.pageSize, take: filters.pageSize, include: includeAssignment }),
    prisma.assignments.count({ where }),
  ]);
  return { assignments: rows.map(safeAssignment), pagination: pageInfo(filters, total), range: { from: filters.from.toISOString().slice(0, 10), to: filters.to.toISOString().slice(0, 10) } };
}
