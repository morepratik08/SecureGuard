import prisma from '../config/prisma.js';
import { HttpError } from '../utils/http-error.js';
import { parseAccountId } from '../validators/account.validator.js';

const ADMIN_ROLES = new Set(['ADMIN', 'SUPER_ADMIN']);
function dateText(value) { return value instanceof Date ? value.toISOString().slice(0, 10) : String(value).slice(0, 10); }
function dateOnly(value) { return new Date(`${dateText(value)}T00:00:00.000Z`); }
function pageInfo(filters, total) { return { page: filters.page, pageSize: filters.pageSize, total, totalPages: Math.ceil(total / filters.pageSize) }; }

const leaveInclude = {
  guards: { select: { id: true, employee_code: true, users: { select: { id: true, name: true } } } },
  users: { select: { id: true, name: true } },
};

function safeLeave(row) {
  return {
    id: row.id.toString(),
    start_date: dateText(row.start_date),
    end_date: dateText(row.end_date),
    reason: row.reason,
    status: row.status ?? 'PENDING',
    reviewed_at: row.reviewed_at?.toISOString() ?? null,
    reviewed_by: row.users ? { id: row.users.id.toString(), name: row.users.name } : null,
    created_at: row.created_at?.toISOString() ?? null,
    guard: {
      id: row.guards.users.id.toString(), profile_id: row.guards.id.toString(),
      name: row.guards.users.name, employee_code: row.guards.employee_code,
    },
  };
}

async function guardProfile(userId) {
  const guard = await prisma.guards.findUnique({ where: { user_id: BigInt(userId) }, select: { id: true } });
  if (!guard) throw new HttpError(403, 'Guard profile is required.');
  return guard;
}

async function supervisorGuardIds(userId) {
  const supervisor = await prisma.supervisors.findUnique({ where: { user_id: BigInt(userId) }, select: { id: true } });
  if (!supervisor) throw new HttpError(403, 'Supervisor profile is required.');
  const assignments = await prisma.assignments.findMany({
    where: { sites: { is: { supervisor_id: supervisor.id } } }, select: { guard_id: true },
  });
  return [...new Set(assignments.map((row) => row.guard_id))];
}

async function leaveScope(actor) {
  if (ADMIN_ROLES.has(actor.role)) return {};
  if (actor.role === 'GUARD') return { guard_id: (await guardProfile(actor.id)).id };
  if (actor.role === 'SUPERVISOR') return { guard_id: { in: await supervisorGuardIds(actor.id) } };
  throw new HttpError(403, 'You are not authorized to access leave requests.');
}

function whereFor(filters, scope) {
  return {
    ...scope,
    ...(filters.guardId ? { guard_id: filters.guardId } : {}),
    ...(filters.status ? { status: filters.status } : {}),
    ...(filters.from || filters.to ? {
      AND: [
        ...(filters.to ? [{ start_date: { lte: filters.to } }] : []),
        ...(filters.from ? [{ end_date: { gte: filters.from } }] : []),
      ],
    } : {}),
    ...(filters.search ? { guards: { is: { OR: [
      { employee_code: { contains: filters.search } },
      { users: { is: { name: { contains: filters.search } } } },
    ] } } } : {}),
  };
}

export async function applyLeave({ userId, input }) {
  const guard = await guardProfile(userId);
  const actorId = BigInt(userId);
  let leaveId;
  try {
    await prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM guards WHERE id = ${guard.id} FOR UPDATE`;
      const overlap = await tx.leaves.findFirst({
        where: {
          guard_id: guard.id,
          status: { in: ['PENDING', 'APPROVED'] },
          start_date: { lte: input.end_date },
          end_date: { gte: input.start_date },
        }, select: { id: true },
      });
      if (overlap) throw new HttpError(409, 'A pending or approved leave request already overlaps these dates.');
      const row = await tx.leaves.create({ data: {
        guard_id: guard.id, start_date: input.start_date, end_date: input.end_date,
        reason: input.reason, status: 'PENDING',
      }, select: { id: true } });
      leaveId = row.id;
      await tx.audit_logs.create({ data: {
        user_id: actorId, action: 'LEAVE_REQUESTED', entity_type: 'LEAVE', entity_id: row.id,
        details: { start_date: dateText(input.start_date), end_date: dateText(input.end_date) },
      } });
    });
  } catch (error) {
    if (error?.code === 'P2002') throw new HttpError(409, 'A leave request already exists for this period.');
    throw error;
  }
  return getLeave({ id: userId, role: 'GUARD' }, leaveId.toString());
}

export async function listLeaves(actor, filters) {
  const where = whereFor(filters, await leaveScope(actor));
  const [rows, total] = await Promise.all([
    prisma.leaves.findMany({ where, orderBy: [{ created_at: 'desc' }, { id: 'desc' }], skip: (filters.page - 1) * filters.pageSize, take: filters.pageSize, include: leaveInclude }),
    prisma.leaves.count({ where }),
  ]);
  return { leaves: rows.map(safeLeave), pagination: pageInfo(filters, total) };
}

export async function getLeave(actor, value) {
  const id = parseAccountId(String(value));
  if (!id) throw new HttpError(400, 'A valid leave ID is required.');
  const row = await prisma.leaves.findFirst({ where: { id, ...(await leaveScope(actor)) }, include: leaveInclude });
  if (!row) throw new HttpError(404, 'Leave request not found.');
  return safeLeave(row);
}

async function decideLeave({ actorId, leaveId, status }) {
  const id = parseAccountId(String(leaveId));
  if (!id) throw new HttpError(400, 'A valid leave ID is required.');
  await prisma.$transaction(async (tx) => {
    const initial = await tx.leaves.findUnique({ where: { id }, select: { id: true, guard_id: true } });
    if (!initial) throw new HttpError(404, 'Leave request not found.');
    // Use the guard-row lock shared by allocation creation, then lock the leave row.
    // This keeps approval and new assignments from passing each other's date checks.
    await tx.$queryRaw`SELECT id FROM guards WHERE id = ${initial.guard_id} FOR UPDATE`;
    const locked = await tx.$queryRaw`
      SELECT id, guard_id, start_date, end_date, status
      FROM leaves WHERE id = ${id} FOR UPDATE
    `;
    const leave = locked[0];
    if (!leave) throw new HttpError(404, 'Leave request not found.');
    if (leave.status !== 'PENDING') throw new HttpError(409, 'Only pending leave requests can be decided.');

    if (status === 'APPROVED') {
      const conflicts = await tx.assignments.findFirst({
        where: {
          guard_id: initial.guard_id,
          status: 'ACTIVE',
          start_date: { lte: leave.end_date },
          OR: [{ end_date: null }, { end_date: { gte: leave.start_date } }],
        }, select: { id: true },
      });
      if (conflicts) throw new HttpError(409, 'End or adjust active assignments before approving leave that overlaps their dates.');
    }

    const reviewedAt = new Date();
    const changed = await tx.leaves.updateMany({
      where: { id, status: 'PENDING' },
      data: { status, reviewed_by: BigInt(actorId), reviewed_at: reviewedAt },
    });
    if (changed.count !== 1) throw new HttpError(409, 'Leave request has already been decided.');
    await tx.audit_logs.create({ data: {
      user_id: BigInt(actorId), action: status === 'APPROVED' ? 'LEAVE_APPROVED' : 'LEAVE_REJECTED',
      entity_type: 'LEAVE', entity_id: id,
      details: { guard_id: initial.guard_id.toString(), status },
    } });
  });
  return getLeave({ id: actorId.toString(), role: 'ADMIN' }, id.toString());
}

export async function approveLeave(args) { return decideLeave({ ...args, status: 'APPROVED' }); }
export async function rejectLeave(args) { return decideLeave({ ...args, status: 'REJECTED' }); }

export async function countPendingLeaves(actor) {
  return prisma.leaves.count({ where: { status: 'PENDING', ...(await leaveScope(actor)) } });
}

export function approvedLeaveOverlaps(leaveStart, leaveEnd, assignmentStart, assignmentEnd) {
  const start = dateText(leaveStart); const end = dateText(leaveEnd);
  const assignmentFirst = dateText(assignmentStart);
  const assignmentLast = assignmentEnd == null ? null : dateText(assignmentEnd);
  return assignmentFirst <= end && (assignmentLast === null || assignmentLast >= start);
}
