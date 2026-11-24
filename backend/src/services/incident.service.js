import prisma from '../config/prisma.js';
import { HttpError } from '../utils/http-error.js';
import { parseAccountId } from '../validators/account.validator.js';

const ADMIN_ROLES = new Set(['SUPER_ADMIN', 'ADMIN']);
const TRANSITIONS = new Map([['OPEN', new Set(['INVESTIGATING'])], ['INVESTIGATING', new Set(['RESOLVED'])], ['RESOLVED', new Set(['CLOSED'])], ['CLOSED', new Set()]]);
const incidentInclude = {
  sites: { select: { id: true, site_name: true } },
  users: { select: { id: true, name: true, role: true } },
};

function pageInfo(filters, total) { return { page: filters.page, pageSize: filters.pageSize, total, totalPages: Math.ceil(total / filters.pageSize) }; }
function safeIncident(row) {
  return {
    id: row.id.toString(), title: row.incident_title, description: row.description,
    severity: row.severity ?? 'LOW', status: row.status ?? 'OPEN',
    incident_time: row.incident_time.toISOString(), created_at: row.created_at?.toISOString() ?? null,
    site: { id: row.sites.id.toString(), name: row.sites.site_name },
    reporter: { id: row.users.id.toString(), name: row.users.name, role: row.users.role },
  };
}
function safeHistory(row) {
  const details = row.details && typeof row.details === 'object' ? row.details : {};
  return {
    id: row.id.toString(), action: row.action, created_at: row.created_at?.toISOString() ?? null,
    actor: row.users ? { id: row.users.id.toString(), name: row.users.name } : null,
    changed_fields: Array.isArray(details.changedFields) ? details.changedFields : [],
    from: typeof details.from === 'string' ? details.from : null,
    to: typeof details.to === 'string' ? details.to : null,
  };
}
function toWhere(filters, scope) {
  return {
    ...scope,
    ...(filters.siteId ? { site_id: filters.siteId } : {}),
    ...(filters.status ? { status: filters.status } : {}),
    ...(filters.severity ? { severity: filters.severity } : {}),
    ...(filters.from || filters.to ? { incident_time: { ...(filters.from ? { gte: filters.from } : {}), ...(filters.to ? { lte: new Date(filters.to.getTime() + 86_399_999) } : {}) } } : {}),
    ...(filters.search ? { OR: [{ incident_title: { contains: filters.search } }, { description: { contains: filters.search } }] } : {}),
  };
}

async function siteScope(actor, client = prisma) {
  if (ADMIN_ROLES.has(actor.role)) return {};
  if (actor.role === 'SUPERVISOR') {
    const profile = await client.supervisors.findUnique({ where: { user_id: BigInt(actor.id) }, select: { id: true } });
    if (!profile) throw new HttpError(403, 'Supervisor profile is required.');
    return { sites: { is: { supervisor_id: profile.id } } };
  }
  if (actor.role === 'CLIENT') {
    const profile = await client.clients.findUnique({ where: { user_id: BigInt(actor.id) }, select: { id: true } });
    if (!profile) throw new HttpError(403, 'Client profile is required.');
    return { sites: { is: { client_id: profile.id } } };
  }
  if (actor.role === 'GUARD') return { reported_by: BigInt(actor.id) };
  throw new HttpError(403, 'You are not authorized to access incidents.');
}

async function canReportAtSite(tx, actor, siteId, incidentTime) {
  const site = await tx.sites.findUnique({ where: { id: siteId }, select: { id: true, status: true, supervisor_id: true, client_id: true } });
  if (!site || site.status !== 'ACTIVE') throw new HttpError(404, 'Active site not found.');
  if (ADMIN_ROLES.has(actor.role)) return site;
  if (actor.role === 'SUPERVISOR') {
    const profile = await tx.supervisors.findUnique({ where: { user_id: BigInt(actor.id) }, select: { id: true, status: true } });
    if (!profile || profile.status !== 'ACTIVE' || site.supervisor_id !== profile.id) throw new HttpError(404, 'Active site not found.');
    return site;
  }
  if (actor.role === 'CLIENT') {
    const profile = await tx.clients.findUnique({ where: { user_id: BigInt(actor.id) }, select: { id: true, status: true } });
    if (!profile || profile.status !== 'ACTIVE' || site.client_id !== profile.id) throw new HttpError(404, 'Active site not found.');
    return site;
  }
  if (actor.role === 'GUARD') {
    const guard = await tx.guards.findUnique({ where: { user_id: BigInt(actor.id) }, select: { id: true, employment_status: true } });
    if (!guard || guard.employment_status !== 'ACTIVE') throw new HttpError(403, 'An active guard profile is required to report an incident.');
    const date = new Date(`${incidentTime.toISOString().slice(0, 10)}T00:00:00.000Z`);
    const assignment = await tx.assignments.findFirst({ where: {
      guard_id: guard.id, site_id: site.id, status: 'ACTIVE', start_date: { lte: date },
      OR: [{ end_date: null }, { end_date: { gte: date } }],
    }, select: { id: true } });
    if (!assignment) throw new HttpError(404, 'Active site not found.');
    return site;
  }
  throw new HttpError(403, 'You are not authorized to report incidents.');
}

function parseId(value) {
  const id = parseAccountId(String(value));
  if (!id) throw new HttpError(400, 'A valid incident ID is required.');
  return id;
}

export async function listIncidents(actor, filters) {
  const where = toWhere(filters, await siteScope(actor));
  const [rows, total] = await Promise.all([
    prisma.incidents.findMany({ where, orderBy: [{ incident_time: 'desc' }, { id: 'desc' }], skip: (filters.page - 1) * filters.pageSize, take: filters.pageSize, include: incidentInclude }),
    prisma.incidents.count({ where }),
  ]);
  return { incidents: rows.map(safeIncident), pagination: pageInfo(filters, total) };
}

export async function getIncident(actor, value) {
  const id = parseId(value);
  const row = await prisma.incidents.findFirst({ where: { id, ...(await siteScope(actor)) }, include: incidentInclude });
  if (!row) throw new HttpError(404, 'Incident not found.');
  const historyRows = await prisma.audit_logs.findMany({
    where: { entity_type: 'INCIDENT', entity_id: id }, orderBy: [{ created_at: 'asc' }, { id: 'asc' }],
    select: { id: true, action: true, created_at: true, details: true, users: { select: { id: true, name: true } } },
  });
  return { ...safeIncident(row), history: historyRows.map(safeHistory) };
}

export async function createIncident({ actor, input }) {
  const result = await prisma.$transaction(async (tx) => {
    await canReportAtSite(tx, actor, input.site_id, input.incident_time);
    const row = await tx.incidents.create({ data: {
      site_id: input.site_id, reported_by: BigInt(actor.id), incident_title: input.incident_title,
      description: input.description, severity: input.severity, incident_time: input.incident_time, status: 'OPEN',
    }, select: { id: true } });
    await tx.audit_logs.create({ data: {
      user_id: BigInt(actor.id), action: 'INCIDENT_REPORTED', entity_type: 'INCIDENT', entity_id: row.id,
      details: { site_id: input.site_id.toString(), severity: input.severity, status: 'OPEN' },
    } });
    return row.id;
  });
  return getIncident(actor, result.toString());
}

async function scopedIncident(actor, id) {
  const row = await prisma.incidents.findFirst({ where: { id, ...(await siteScope(actor)) }, select: { id: true } });
  if (!row) throw new HttpError(404, 'Incident not found.');
}

export async function updateIncident({ actor, incidentId, input }) {
  if (!ADMIN_ROLES.has(actor.role) && actor.role !== 'SUPERVISOR') throw new HttpError(403, 'You are not authorized to update incidents.');
  const id = parseId(incidentId);
  await scopedIncident(actor, id);
  await prisma.$transaction(async (tx) => {
    const rows = await tx.$queryRaw`SELECT id FROM incidents WHERE id = ${id} FOR UPDATE`;
    if (!rows[0]) throw new HttpError(404, 'Incident not found.');
    const currentScope = await siteScope(actor, tx);
    if (!await tx.incidents.findFirst({ where: { id, ...currentScope }, select: { id: true } })) throw new HttpError(404, 'Incident not found.');
    await tx.incidents.update({ where: { id }, data: input });
    await tx.audit_logs.create({ data: { user_id: BigInt(actor.id), action: 'INCIDENT_UPDATED', entity_type: 'INCIDENT', entity_id: id, details: { changedFields: Object.keys(input).sort() } } });
  });
  return getIncident(actor, id.toString());
}

export async function updateIncidentStatus({ actor, incidentId, status }) {
  if (!ADMIN_ROLES.has(actor.role) && actor.role !== 'SUPERVISOR') throw new HttpError(403, 'You are not authorized to change incident status.');
  const id = parseId(incidentId);
  await scopedIncident(actor, id);
  await prisma.$transaction(async (tx) => {
    const rows = await tx.$queryRaw`SELECT id, status FROM incidents WHERE id = ${id} FOR UPDATE`;
    const incident = rows[0];
    if (!incident) throw new HttpError(404, 'Incident not found.');
    const currentScope = await siteScope(actor, tx);
    if (!await tx.incidents.findFirst({ where: { id, ...currentScope }, select: { id: true } })) throw new HttpError(404, 'Incident not found.');
    if (!TRANSITIONS.get(incident.status ?? 'OPEN')?.has(status)) throw new HttpError(409, 'Incident status transition is not permitted.');
    await tx.incidents.update({ where: { id }, data: { status } });
    await tx.audit_logs.create({ data: { user_id: BigInt(actor.id), action: 'INCIDENT_STATUS_CHANGED', entity_type: 'INCIDENT', entity_id: id, details: { from: incident.status ?? 'OPEN', to: status } } });
  });
  return getIncident(actor, id.toString());
}

export async function incidentSummary(actor) {
  const scope = await siteScope(actor);
  const [open, investigating, resolved] = await Promise.all([
    prisma.incidents.count({ where: { ...scope, status: 'OPEN' } }),
    prisma.incidents.count({ where: { ...scope, status: 'INVESTIGATING' } }),
    prisma.incidents.count({ where: { ...scope, status: 'RESOLVED' } }),
  ]);
  return { open, investigating, resolved };
}

export function canTransitionIncident(from, to) { return Boolean(TRANSITIONS.get(from)?.has(to)); }
export function nextIncidentStatuses(from) { return [...(TRANSITIONS.get(from) ?? [])]; }

export async function listIncidentReportSites(actor) {
  let where = { status: 'ACTIVE' };
  if (actor.role === 'SUPERVISOR') {
    const profile = await prisma.supervisors.findUnique({ where: { user_id: BigInt(actor.id) }, select: { id: true, status: true } });
    if (!profile || profile.status !== 'ACTIVE') throw new HttpError(403, 'Supervisor profile is required.');
    where.supervisor_id = profile.id;
  } else if (actor.role === 'CLIENT') {
    const profile = await prisma.clients.findUnique({ where: { user_id: BigInt(actor.id) }, select: { id: true, status: true } });
    if (!profile || profile.status !== 'ACTIVE') throw new HttpError(403, 'Client profile is required.');
    where.client_id = profile.id;
  } else if (actor.role === 'GUARD') {
    const guard = await prisma.guards.findUnique({ where: { user_id: BigInt(actor.id) }, select: { id: true, employment_status: true } });
    if (!guard || guard.employment_status !== 'ACTIVE') throw new HttpError(403, 'An active guard profile is required to report an incident.');
    const now = new Date();
    const date = new Date(`${now.toISOString().slice(0, 10)}T00:00:00.000Z`);
    const assignments = await prisma.assignments.findMany({ where: { guard_id: guard.id, status: 'ACTIVE', start_date: { lte: date }, OR: [{ end_date: null }, { end_date: { gte: date } }] }, select: { site_id: true } });
    const siteIds = [...new Set(assignments.map((row) => row.site_id))];
    if (!siteIds.length) return [];
    where.id = { in: siteIds };
  } else if (!ADMIN_ROLES.has(actor.role)) {
    throw new HttpError(403, 'You are not authorized to report incidents.');
  }
  const sites = await prisma.sites.findMany({ where, orderBy: { site_name: 'asc' }, select: { id: true, site_name: true } });
  return sites.map((site) => ({ id: site.id.toString(), name: site.site_name }));
}
