import { Prisma } from '@prisma/client';
import prisma from '../config/prisma.js';
import { HttpError } from '../utils/http-error.js';
import { parseAccountId } from '../validators/account.validator.js';
import { nextAuthVersion } from './account.service.js';

const ADMIN_ROLES = new Set(['SUPER_ADMIN', 'ADMIN']);
const EMPLOYEE_ROLES = new Set(['GUARD', 'SUPERVISOR']);

function combineWhere(...conditions) {
  const present = conditions.filter((condition) => condition && Object.keys(condition).length > 0);
  if (present.length === 0) return {};
  if (present.length === 1) return present[0];
  return { AND: present };
}

function toIso(value) {
  return value instanceof Date ? value.toISOString() : null;
}

function dateOnly(value) {
  return value instanceof Date ? value.toISOString().slice(0, 10) : null;
}

function decimalFixed(value, places) {
  if (value === null || value === undefined) return null;
  if (typeof value.toFixed === 'function') return value.toFixed(places);
  const [whole, fraction = ''] = String(value).split('.');
  return `${whole}.${fraction.padEnd(places, '0').slice(0, places)}`;
}

function effectiveStatus(role, profileStatus, isActive) {
  if (role === 'GUARD' && profileStatus === 'TERMINATED') return 'TERMINATED';
  if (!isActive || profileStatus === 'INACTIVE') return 'INACTIVE';
  return profileStatus || 'ACTIVE';
}

function formatListEntry(profile, role) {
  const user = profile.users;
  const profileStatus = role === 'GUARD' ? profile.employment_status : profile.status;
  return {
    id: user.id.toString(),
    role,
    name: user.name,
    email: user.email,
    phone: user.phone,
    employee_code: profile.employee_code,
    joining_date: dateOnly(profile.joining_date),
    employment_status: effectiveStatus(role, profileStatus, user.is_active === true),
    is_active: user.is_active === true,
    created_at: toIso(profile.created_at ?? user.created_at),
    profile_created_at: toIso(profile.created_at ?? user.created_at),
  };
}

function formatDetails(user, actorRole, selfView) {
  const role = user.role;
  const profile = role === 'GUARD' ? user.guards : user.supervisors;
  const isAdmin = ADMIN_ROLES.has(actorRole);
  if (!profile || !EMPLOYEE_ROLES.has(role)) throw new HttpError(404, 'Employee not found.');

  const profileStatus = role === 'GUARD' ? profile.employment_status : profile.status;
  const details = {
    id: user.id.toString(),
    role,
    name: user.name,
    email: user.email,
    phone: user.phone,
    is_active: user.is_active === true,
    employee_code: profile.employee_code,
    joining_date: dateOnly(profile.joining_date),
    employment_status: effectiveStatus(role, profileStatus, user.is_active === true),
    created_at: toIso(profile.created_at ?? user.created_at),
    profile_created_at: toIso(profile.created_at ?? user.created_at),
  };

  if (role === 'GUARD' && (isAdmin || selfView)) {
    Object.assign(details, {
      date_of_birth: dateOnly(profile.date_of_birth),
      gender: profile.gender,
      address: profile.address,
      qualification: profile.qualification,
      experience_years: decimalFixed(profile.experience_years, 1),
      emergency_contact: profile.emergency_contact,
    });
  }
  if (role === 'GUARD' && isAdmin) details.base_salary = decimalFixed(profile.base_salary, 2);
  return details;
}

function supervisorGuardScope(supervisorId) {
  return {
    assignments: {
      some: {
        sites: { is: { supervisor_id: supervisorId } },
      },
    },
  };
}

async function getSupervisorProfileId(actorId) {
  const supervisor = await prisma.supervisors.findUnique({
    where: { user_id: BigInt(actorId) },
    select: { id: true },
  });
  return supervisor?.id ?? null;
}

function searchWhere(search) {
  if (!search) return {};
  return {
    OR: [
      { employee_code: { contains: search } },
      { users: { is: { name: { contains: search } } } },
      { users: { is: { email: { contains: search } } } },
    ],
  };
}

function statusWhere(role, status) {
  if (!status) return {};
  const profileField = role === 'GUARD' ? 'employment_status' : 'status';
  if (status === 'INACTIVE') {
    if (role === 'GUARD') {
      return {
        OR: [
          { employment_status: 'INACTIVE' },
          { AND: [{ users: { is: { is_active: false } } }, { employment_status: { not: 'TERMINATED' } }] },
        ],
      };
    }
    return {
      OR: [
        { [profileField]: 'INACTIVE' },
        { users: { is: { is_active: false } } },
      ],
    };
  }
  if (role === 'GUARD' && status === 'TERMINATED') return { employment_status: 'TERMINATED' };
  return {
    [profileField]: status,
    users: { is: { is_active: true } },
  };
}

function sortComparator(a, b, sortBy, direction) {
  const fields = {
    name: ['name'],
    employeeCode: ['employee_code'],
    role: ['role'],
    status: ['employment_status'],
    joiningDate: ['joining_date'],
  };
  const field = fields[sortBy][0];
  const left = String(a[field] ?? '').toLocaleLowerCase();
  const right = String(b[field] ?? '').toLocaleLowerCase();
  const comparison = left.localeCompare(right, undefined, { numeric: true });
  if (comparison !== 0) return direction === 'asc' ? comparison : -comparison;
  const byName = a.name.localeCompare(b.name, undefined, { sensitivity: 'base' });
  if (byName !== 0) return byName;
  return a.id.localeCompare(b.id, undefined, { numeric: true });
}

function prismaOrderBy(role, sortBy, sortOrder) {
  const profileField = role === 'GUARD' ? 'employment_status' : 'status';
  const primary = {
    name: { users: { name: sortOrder } },
    employeeCode: { employee_code: sortOrder },
    role: { users: { name: sortOrder } },
    status: { [profileField]: sortOrder },
    joiningDate: { joining_date: sortOrder },
  }[sortBy];
  return [primary, { employee_code: 'asc' }, { id: 'asc' }];
}

export async function listEmployees(actor, filters) {
  let guardScope = {};
  if (actor.role === 'SUPERVISOR') {
    const supervisorId = await getSupervisorProfileId(actor.id);
    if (supervisorId === null) return { employees: [], pagination: pagination(filters, 0) };
    guardScope = supervisorGuardScope(supervisorId);
  }

  const roles = filters.role ? [filters.role] : actor.role === 'SUPERVISOR' ? ['GUARD'] : ['GUARD', 'SUPERVISOR'];
  const windowSize = ((filters.page - 1) * filters.pageSize) + filters.pageSize;
  const requests = roles.map(async (role) => {
    // ON_LEAVE and TERMINATED are guard-only employment states, not supervisor enum values.
    if (role === 'SUPERVISOR' && ['ON_LEAVE', 'TERMINATED'].includes(filters.status)) {
      return { role, rows: [], count: 0 };
    }
    const model = role === 'GUARD' ? prisma.guards : prisma.supervisors;
    const where = combineWhere(
      role === 'GUARD' ? guardScope : {},
      searchWhere(filters.search),
      statusWhere(role, filters.status),
    );
    const [rows, count] = await Promise.all([
      model.findMany({
        where,
        orderBy: prismaOrderBy(role, filters.sortBy, filters.sortOrder),
        take: windowSize,
        include: {
          users: { select: { id: true, name: true, email: true, phone: true, is_active: true, created_at: true } },
        },
      }),
      model.count({ where }),
    ]);
    return { role, rows, count };
  });

  const results = await Promise.all(requests);
  const total = results.reduce((sum, result) => sum + result.count, 0);
  const merged = results.flatMap(({ role, rows }) => rows.map((row) => formatListEntry(row, role)));
  merged.sort((a, b) => sortComparator(a, b, filters.sortBy, filters.sortOrder));
  const offset = (filters.page - 1) * filters.pageSize;
  return {
    employees: merged.slice(offset, offset + filters.pageSize),
    pagination: pagination(filters, total),
  };
}

function pagination(filters, total) {
  return {
    page: filters.page,
    pageSize: filters.pageSize,
    total,
    totalPages: Math.ceil(total / filters.pageSize),
  };
}

export async function getEmployeeSummary(actor) {
  let guardScope = {};
  if (actor.role === 'SUPERVISOR') {
    const supervisorId = await getSupervisorProfileId(actor.id);
    if (supervisorId === null) {
      return { totalGuards: 0, totalSupervisors: 0, activeEmployees: 0, inactiveEmployees: 0, employeesOnLeave: 0 };
    }
    guardScope = supervisorGuardScope(supervisorId);
  }

  const guards = prisma.guards;
  const supervisors = prisma.supervisors;
  const guardCount = (where) => guards.count({ where: combineWhere(guardScope, where) });
  const supervisorCount = (where) => actor.role === 'SUPERVISOR' ? Promise.resolve(0) : supervisors.count({ where });
  const [totalGuards, totalSupervisors, activeGuards, activeSupervisors, inactiveGuards, inactiveSupervisors, onLeave] = await Promise.all([
    guardCount({}),
    supervisorCount({}),
    guardCount({ employment_status: 'ACTIVE', users: { is: { is_active: true } } }),
    supervisorCount({ status: 'ACTIVE', users: { is: { is_active: true } } }),
    guardCount({ OR: [{ employment_status: { in: ['INACTIVE', 'TERMINATED'] } }, { users: { is: { is_active: false } } }] }),
    supervisorCount({ OR: [{ status: 'INACTIVE' }, { users: { is: { is_active: false } } }] }),
    guardCount({ employment_status: 'ON_LEAVE', users: { is: { is_active: true } } }),
  ]);
  return {
    totalGuards,
    totalSupervisors,
    activeEmployees: activeGuards + activeSupervisors,
    inactiveEmployees: inactiveGuards + inactiveSupervisors,
    employeesOnLeave: onLeave,
  };
}

async function findEmployeeUser(client, id) {
  return client.users.findUnique({
    where: { id },
    select: {
      id: true,
      name: true,
      email: true,
      phone: true,
      role: true,
      is_active: true,
      created_at: true,
      updated_at: true,
      guards: {
        select: {
          id: true, employee_code: true, date_of_birth: true, gender: true, address: true,
          joining_date: true, qualification: true, experience_years: true, emergency_contact: true,
          base_salary: true, employment_status: true, created_at: true,
        },
      },
      supervisors: {
        select: { id: true, employee_code: true, joining_date: true, status: true },
      },
    },
  });
}

async function assertVisibleToActor(actor, user) {
  if (!user || !EMPLOYEE_ROLES.has(user.role)) throw new HttpError(404, 'Employee not found.');
  if (ADMIN_ROLES.has(actor.role)) return false;
  if (actor.role === 'GUARD' && user.role === 'GUARD' && user.id.toString() === actor.id) return true;
  if (actor.role === 'SUPERVISOR' && user.role === 'GUARD') {
    const supervisorId = await getSupervisorProfileId(actor.id);
    if (supervisorId !== null) {
      const assignment = await prisma.guards.findFirst({
        where: combineWhere({ user_id: user.id }, supervisorGuardScope(supervisorId)),
        select: { id: true },
      });
      if (assignment) return false;
    }
  }
  throw new HttpError(404, 'Employee not found.');
}

export async function getEmployeeById(actor, employeeId) {
  const id = parseAccountId(employeeId);
  if (!id) throw new HttpError(400, 'A valid employee ID is required.');
  const user = await findEmployeeUser(prisma, id);
  const selfView = await assertVisibleToActor(actor, user);
  return formatDetails(user, actor.role, selfView);
}

export async function getMyEmployeeProfile(actor) {
  if (!['GUARD', 'SUPERVISOR'].includes(actor.role)) throw new HttpError(404, 'Employee profile not found.');
  const id = parseAccountId(actor.id);
  const user = id ? await findEmployeeUser(prisma, id) : null;
  if (!user || user.role !== actor.role) throw new HttpError(404, 'Employee profile not found.');
  return formatDetails(user, actor.role, true);
}

export async function updateEmployeeProfile({ actorId, actorRole, employeeId, input }) {
  const id = parseAccountId(employeeId);
  if (!id) throw new HttpError(400, 'A valid employee ID is required.');
  const user = await findEmployeeUser(prisma, id);
  if (!user || !EMPLOYEE_ROLES.has(user.role)) throw new HttpError(404, 'Employee not found.');

  const userData = {};
  for (const field of ['name', 'email', 'phone']) {
    if (Object.hasOwn(input, field)) userData[field] = input[field];
  }
  const profileData = {};
  const profileFields = user.role === 'GUARD'
    ? ['employee_code', 'date_of_birth', 'gender', 'address', 'joining_date', 'qualification', 'experience_years', 'emergency_contact', 'base_salary']
    : ['employee_code', 'joining_date'];
  for (const field of profileFields) {
    if (Object.hasOwn(input, field)) profileData[field] = input[field];
  }

  try {
    await prisma.$transaction(async (tx) => {
      if (userData.email) {
        const emailMatches = await tx.$queryRaw`
          SELECT id FROM users WHERE LOWER(TRIM(email)) = ${userData.email} AND id <> ${id} LIMIT 1
        `;
        if (emailMatches.length > 0) throw new HttpError(409, 'An account with that email already exists.');
      }

      if (profileData.employee_code) {
        const matchingGuards = await tx.$queryRaw`
          SELECT id FROM guards WHERE UPPER(TRIM(employee_code)) = ${profileData.employee_code} AND user_id <> ${id} LIMIT 1
        `;
        const matchingSupervisors = await tx.$queryRaw`
          SELECT id FROM supervisors WHERE UPPER(TRIM(employee_code)) = ${profileData.employee_code} AND user_id <> ${id} LIMIT 1
        `;
        if (matchingGuards.length || matchingSupervisors.length) {
          throw new HttpError(409, 'An employee with that employee code already exists.');
        }
      }

      if (Object.keys(userData).length) {
        await tx.users.update({
          where: { id },
          data: { ...userData, updated_at: nextAuthVersion(user.updated_at) },
        });
      }
      if (Object.keys(profileData).length) {
        if (profileData.base_salary !== undefined && profileData.base_salary !== null) {
          profileData.base_salary = new Prisma.Decimal(profileData.base_salary);
        }
        if (profileData.experience_years !== undefined && profileData.experience_years !== null) {
          profileData.experience_years = new Prisma.Decimal(profileData.experience_years);
        }
        if (user.role === 'GUARD') {
          await tx.guards.update({ where: { user_id: id }, data: profileData });
        } else {
          await tx.supervisors.update({ where: { user_id: id }, data: profileData });
        }
      }

      await tx.audit_logs.create({
        data: {
          user_id: BigInt(actorId),
          action: 'EMPLOYEE_PROFILE_UPDATED',
          entity_type: 'EMPLOYEE',
          entity_id: id,
          details: { role: user.role, changedFields: Object.keys(input).sort() },
        },
      });
    });
  } catch (error) {
    if (error?.code === 'P2002') throw new HttpError(409, 'An account with that email or employee code already exists.');
    throw error;
  }
  return getEmployeeById({ id: actorId, role: actorRole }, id.toString());
}

export async function updateEmployeeStatus({ actorId, actorRole, employeeId, status }) {
  const id = parseAccountId(employeeId);
  if (!id) throw new HttpError(400, 'A valid employee ID is required.');

  await prisma.$transaction(async (tx) => {
    const user = await findEmployeeUser(tx, id);
    if (!user || !EMPLOYEE_ROLES.has(user.role)) throw new HttpError(404, 'Employee not found.');
    const profile = user.role === 'GUARD' ? user.guards : user.supervisors;
    if (!profile) throw new HttpError(404, 'Employee not found.');
    const currentStatus = effectiveStatus(
      user.role,
      user.role === 'GUARD' ? profile.employment_status : profile.status,
      user.is_active === true,
    );
    const isActive = status === 'ACTIVE' || status === 'ON_LEAVE';

    if (user.role === 'GUARD') {
      await tx.guards.update({ where: { user_id: id }, data: { employment_status: status } });
    } else {
      await tx.supervisors.update({ where: { user_id: id }, data: { status } });
    }
    await tx.users.update({
      where: { id },
      data: { is_active: isActive, updated_at: nextAuthVersion(user.updated_at) },
    });
    await tx.audit_logs.create({
      data: {
        user_id: BigInt(actorId),
        action: 'EMPLOYEE_STATUS_CHANGED',
        entity_type: 'EMPLOYEE',
        entity_id: id,
        details: { role: user.role, from: currentStatus, to: status },
      },
    });
  });

  return getEmployeeById({ id: actorId, role: actorRole }, id.toString());
}
