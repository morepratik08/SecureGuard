import prisma from '../config/prisma.js';
import { HttpError } from '../utils/http-error.js';
import { parseAccountId } from '../validators/account.validator.js';

function minutes(value) {
  const [hours, mins, seconds = '00'] = value.split(':');
  return Number(hours) * 60 + Number(mins) + Number(seconds) / 60;
}
function timeDate(value) { return new Date(`1970-01-01T${value}Z`); }
function timeString(value) {
  if (!(value instanceof Date) || Number.isNaN(value.getTime())) return null;
  return value.toISOString().slice(11, 19);
}
function serialize(shift) {
  return {
    id: shift.id.toString(), shift_name: shift.shift_name,
    start_time: timeString(shift.start_time), end_time: timeString(shift.end_time),
    is_active: shift.is_active === true, description: shift.description,
    active_assignment_count: shift._count?.assignments ?? 0,
  };
}
function pageInfo(filters, total) { return { page: filters.page, pageSize: filters.pageSize, total, totalPages: Math.ceil(total / filters.pageSize) }; }
const includes = { _count: { select: { assignments: { where: { status: 'ACTIVE' } } } } };

export async function listShifts(filters) {
  const where = {
    ...(filters.isActive === undefined ? {} : { is_active: filters.isActive }),
    ...(filters.search ? { shift_name: { contains: filters.search } } : {}),
  };
  const [rows, total] = await Promise.all([
    prisma.shifts.findMany({ where, orderBy: [{ start_time: 'asc' }, { shift_name: 'asc' }], skip: (filters.page - 1) * filters.pageSize, take: filters.pageSize, include: includes }),
    prisma.shifts.count({ where }),
  ]);
  return { shifts: rows.map(serialize), pagination: pageInfo(filters, total) };
}
export async function getShift(value) {
  const id = parseAccountId(value);
  if (!id) throw new HttpError(400, 'A valid shift ID is required.');
  const row = await prisma.shifts.findUnique({ where: { id }, include: includes });
  if (!row) throw new HttpError(404, 'Shift not found.');
  return serialize(row);
}
export async function createShift({ actorId, input }) {
  const row = await prisma.$transaction(async (tx) => {
    const created = await tx.shifts.create({ data: {
      shift_name: input.shift_name, start_time: timeDate(input.start_time), end_time: timeDate(input.end_time),
      ...(input.description === undefined ? {} : { description: input.description }), is_active: true,
    } });
    await tx.audit_logs.create({ data: { user_id: BigInt(actorId), action: 'SHIFT_CREATED', entity_type: 'SHIFT', entity_id: created.id, details: { shift_name: created.shift_name } } });
    return created;
  });
  return getShift(row.id.toString());
}
export async function updateShift({ actorId, shiftId, input }) {
  const id = parseAccountId(shiftId);
  if (!id) throw new HttpError(400, 'A valid shift ID is required.');
  await prisma.$transaction(async (tx) => {
    const rows = await tx.$queryRaw`SELECT id FROM shifts WHERE id = ${id} FOR UPDATE`;
    if (!rows.length) throw new HttpError(404, 'Shift not found.');
    const current = await tx.shifts.findUnique({ where: { id } });
    const timeChanged = (input.start_time && input.start_time !== timeString(current.start_time))
      || (input.end_time && input.end_time !== timeString(current.end_time));
    if (timeChanged) {
      const linked = await tx.assignments.count({ where: { shift_id: id } });
      if (linked > 0) throw new HttpError(409, 'Shift times cannot change after assignments reference this shift.');
    }
    const data = { ...input };
    if (input.start_time) data.start_time = timeDate(input.start_time);
    if (input.end_time) data.end_time = timeDate(input.end_time);
    await tx.shifts.update({ where: { id }, data });
    await tx.audit_logs.create({ data: { user_id: BigInt(actorId), action: 'SHIFT_UPDATED', entity_type: 'SHIFT', entity_id: id, details: { changedFields: Object.keys(input).sort() } } });
  });
  return getShift(id.toString());
}
export async function updateShiftStatus({ actorId, shiftId, isActive }) {
  const id = parseAccountId(shiftId);
  if (!id) throw new HttpError(400, 'A valid shift ID is required.');
  await prisma.$transaction(async (tx) => {
    const rows = await tx.$queryRaw`SELECT id FROM shifts WHERE id = ${id} FOR UPDATE`;
    if (!rows.length) throw new HttpError(404, 'Shift not found.');
    const current = await tx.shifts.findUnique({ where: { id } });
    if (isActive === false) {
      const active = await tx.assignments.count({ where: { shift_id: id, status: 'ACTIVE' } });
      if (active > 0) throw new HttpError(409, 'End active assignments before deactivating this shift.');
    }
    await tx.shifts.update({ where: { id }, data: { is_active: isActive } });
    await tx.audit_logs.create({ data: { user_id: BigInt(actorId), action: 'SHIFT_STATUS_CHANGED', entity_type: 'SHIFT', entity_id: id, details: { from: current.is_active === true, to: isActive } } });
  });
  return getShift(id.toString());
}

export function shiftDurationMinutes(shift) {
  const start = minutes(shift.start_time);
  let end = minutes(shift.end_time);
  if (end === start) return 0;
  if (end < start) end += 24 * 60;
  return end - start;
}
