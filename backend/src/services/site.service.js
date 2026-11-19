import prisma from '../config/prisma.js';
import { HttpError } from '../utils/http-error.js';
import { parseAccountId } from '../validators/account.validator.js';

const admins = new Set(['SUPER_ADMIN', 'ADMIN']);
function paging(filters, total) { return { page: filters.page, pageSize: filters.pageSize, total, totalPages: Math.ceil(total / filters.pageSize) }; }
function safeSite(site, { includeGuards = false } = {}) {
  return {
    id: site.id.toString(), site_name: site.site_name, address: site.address,
    required_guards: site.required_guards ?? 1, status: site.status ?? 'ACTIVE',
    created_at: site.created_at?.toISOString() ?? null,
    client: { id: site.clients.id.toString(), company_name: site.clients.company_name },
    supervisor: site.supervisors ? { id: site.supervisors.users.id.toString(), profile_id: site.supervisors.id.toString(), employee_code: site.supervisors.employee_code, name: site.supervisors.users.name } : null,
    active_guard_count: new Set((site.assignments ?? []).map((row) => row.guard_id.toString())).size,
    ...(includeGuards ? { guards: (site.assignments ?? []).map(({ guards }) => ({ id: guards.users.id.toString(), name: guards.users.name, employee_code: guards.employee_code })) } : {}),
  };
}
function includeSite({ guards = false } = {}) {
  return {
    clients: { select: { id: true, company_name: true, user_id: true } },
    supervisors: { select: { id: true, employee_code: true, users: { select: { name: true, is_active: true } } } },
    ...(guards ? {
      assignments: {
        where: { status: 'ACTIVE' },
        select: {
          guard_id: true,
          guards: { select: { employee_code: true, users: { select: { id: true, name: true } } } },
        },
      },
    } : {}),
  };
}
async function scopeFor(actor) {
  if (admins.has(actor.role)) return {};
  if (actor.role === 'CLIENT') {
    const client = await prisma.clients.findUnique({ where: { user_id: BigInt(actor.id) }, select: { id: true } });
    if (!client) throw new HttpError(404, 'Client not found.');
    return { client_id: client.id };
  }
  if (actor.role === 'SUPERVISOR') {
    const supervisor = await prisma.supervisors.findUnique({ where: { user_id: BigInt(actor.id) }, select: { id: true } });
    if (!supervisor) throw new HttpError(404, 'Supervisor profile not found.');
    return { supervisor_id: supervisor.id };
  }
  throw new HttpError(403, 'You are not authorized to access sites.');
}
async function verifyRelations(tx, { clientId, supervisorId }) {
  if (clientId !== undefined) {
    const client = await tx.clients.findUnique({ where: { id: clientId }, select: { id: true, status: true, users: { select: { is_active: true, role: true } } } });
    if (!client || client.status !== 'ACTIVE' || client.users?.is_active !== true || client.users?.role !== 'CLIENT') throw new HttpError(400, 'The selected client is not eligible for site assignment.');
  }
  if (supervisorId !== undefined && supervisorId !== null) {
    const supervisor = await tx.supervisors.findUnique({ where: { id: supervisorId }, select: { id: true, status: true, users: { select: { is_active: true, role: true } } } });
    if (!supervisor || supervisor.status !== 'ACTIVE' || supervisor.users?.is_active !== true || supervisor.users?.role !== 'SUPERVISOR') throw new HttpError(400, 'The selected supervisor is not eligible for site assignment.');
  }
}

export async function listSites(actor, filters) {
  const scope = await scopeFor(actor);
  const where = {
    ...scope,
    ...(filters.status ? { status: filters.status } : {}),
    ...(filters.clientId ? { client_id: filters.clientId } : {}),
    ...(filters.supervisorId ? { supervisor_id: filters.supervisorId } : {}),
    ...(filters.search ? { OR: [{ site_name: { contains: filters.search } }, { address: { contains: filters.search } }] } : {}),
  };
  const [sites, total] = await Promise.all([
    prisma.sites.findMany({ where, orderBy: { site_name: 'asc' }, skip: (filters.page - 1) * filters.pageSize, take: filters.pageSize,
      include: { ...includeSite(), assignments: { where: { status: 'ACTIVE' }, select: { guard_id: true } } } }),
    prisma.sites.count({ where }),
  ]);
  return { sites: sites.map((site) => safeSite(site)), pagination: paging(filters, total) };
}

export async function getSite(actor, value) {
  const id = parseAccountId(value);
  if (!id) throw new HttpError(400, 'A valid site ID is required.');
  const site = await prisma.sites.findFirst({ where: { id, ...(await scopeFor(actor)) }, include: includeSite({ guards: true }) });
  if (!site) throw new HttpError(404, 'Site not found.');
  return safeSite(site, { includeGuards: actor.role !== 'CLIENT' });
}

export async function getSiteOptions() {
  const [clients, supervisors] = await Promise.all([
    prisma.clients.findMany({ where: { status: 'ACTIVE', users: { is: { is_active: true, role: 'CLIENT' } } }, orderBy: { company_name: 'asc' }, select: { id: true, company_name: true } }),
    prisma.supervisors.findMany({ where: { status: 'ACTIVE', users: { is: { is_active: true, role: 'SUPERVISOR' } } }, orderBy: { employee_code: 'asc' }, select: { id: true, employee_code: true, users: { select: { name: true } } } }),
  ]);
  return {
    clients: clients.map((client) => ({ id: client.id.toString(), company_name: client.company_name })),
    supervisors: supervisors.map((person) => ({ id: person.id.toString(), employee_code: person.employee_code, name: person.users.name })),
  };
}

export async function createSite({ actorId, input }) {
  try {
    const created = await prisma.$transaction(async (tx) => {
      await verifyRelations(tx, { clientId: input.client_id, supervisorId: input.supervisor_id });
      const site = await tx.sites.create({ data: input });
      await tx.audit_logs.create({ data: { user_id: BigInt(actorId), action: 'SITE_CREATED', entity_type: 'SITE', entity_id: site.id, details: { client_id: input.client_id.toString(), supervisor_id: input.supervisor_id?.toString() ?? null } } });
      return site;
    });
    return getSite({ id: actorId, role: 'ADMIN' }, created.id.toString());
  } catch (error) {
    if (error?.code === 'P2003') throw new HttpError(400, 'The selected client or supervisor does not exist.');
    throw error;
  }
}

export async function updateSite({ actorId, siteId, input }) {
  const id = parseAccountId(siteId);
  if (!id) throw new HttpError(400, 'A valid site ID is required.');
  try {
    await prisma.$transaction(async (tx) => {
      const current = await tx.sites.findUnique({ where: { id }, select: { id: true, client_id: true, supervisor_id: true, site_name: true, address: true, required_guards: true, status: true } });
      if (!current) throw new HttpError(404, 'Site not found.');
      const clientChanged = input.client_id !== undefined && input.client_id !== current.client_id;
      const supervisorChanged = Object.hasOwn(input, 'supervisor_id') && input.supervisor_id !== current.supervisor_id;
      if (clientChanged) {
        const [assignments, attendance, incidents] = await Promise.all([
          tx.assignments.count({ where: { site_id: id } }),
          tx.attendance.count({ where: { site_id: id } }),
          tx.incidents.count({ where: { site_id: id } }),
        ]);
        if (assignments + attendance + incidents > 0) {
          throw new HttpError(409, 'A site with operational history cannot be moved to another client.');
        }
      }
      if (clientChanged || supervisorChanged) {
        await verifyRelations(tx, {
          ...(clientChanged ? { clientId: input.client_id } : {}),
          ...(supervisorChanged ? { supervisorId: input.supervisor_id } : {}),
        });
      }
      await tx.sites.update({ where: { id }, data: input });
      await tx.audit_logs.create({ data: { user_id: BigInt(actorId), action: 'SITE_UPDATED', entity_type: 'SITE', entity_id: id, details: { changedFields: Object.keys(input).sort() } } });
    });
  } catch (error) {
    if (error?.code === 'P2003') throw new HttpError(400, 'The selected client or supervisor does not exist.');
    throw error;
  }
  return getSite({ id: actorId, role: 'ADMIN' }, id.toString());
}

export async function updateSiteStatus({ actorId, siteId, status }) {
  const id = parseAccountId(siteId);
  if (!id) throw new HttpError(400, 'A valid site ID is required.');
  await prisma.$transaction(async (tx) => {
    const current = await tx.sites.findUnique({ where: { id }, select: { status: true } });
    if (!current) throw new HttpError(404, 'Site not found.');
    if (status === 'INACTIVE') {
      const activeAssignments = await tx.assignments.count({ where: { site_id: id, status: 'ACTIVE' } });
      if (activeAssignments > 0) throw new HttpError(409, 'Reassign or complete active guard assignments before deactivating this site.');
    }
    await tx.sites.update({ where: { id }, data: { status } });
    await tx.audit_logs.create({ data: { user_id: BigInt(actorId), action: 'SITE_STATUS_CHANGED', entity_type: 'SITE', entity_id: id, details: { from: current.status ?? 'ACTIVE', to: status } } });
  });
  return getSite({ id: actorId, role: 'ADMIN' }, id.toString());
}
