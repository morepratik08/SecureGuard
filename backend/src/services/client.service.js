import prisma from '../config/prisma.js';
import { HttpError } from '../utils/http-error.js';
import { normalizeEmail } from '../utils/normalize-email.js';
import { parseAccountId } from '../validators/account.validator.js';
import { nextAuthVersion } from './account.service.js';

const admins = new Set(['SUPER_ADMIN', 'ADMIN']);
function pagination(filters, total) {
  return { page: filters.page, pageSize: filters.pageSize, total, totalPages: Math.ceil(total / filters.pageSize) };
}
function safeClient(client, { includeRelations = false } = {}) {
  return {
    id: client.id.toString(), user_id: client.user_id.toString(), company_name: client.company_name,
    contact_person: client.contact_person, company_email: client.company_email, phone: client.phone,
    billing_address: client.billing_address, gstin: client.gstin,
    status: client.status === 'ACTIVE' && client.users?.is_active === true ? 'ACTIVE' : 'INACTIVE',
    name: client.users?.name ?? null, email: client.users?.email ?? null,
    created_at: client.users?.created_at?.toISOString() ?? null,
    site_count: client._count?.sites ?? client.sites?.length ?? 0,
    ...(includeRelations ? {
      sites: (client.sites ?? []).map((site) => ({
        id: site.id.toString(), site_name: site.site_name, address: site.address,
        status: site.status ?? 'ACTIVE', required_guards: site.required_guards,
        supervisor: site.supervisors ? { id: site.supervisors.users.id.toString(), profile_id: site.supervisors.id.toString(), name: site.supervisors.users.name } : null,
        active_guard_count: new Set((site.assignments ?? []).map((assignment) => assignment.guard_id.toString())).size,
        created_at: site.created_at?.toISOString() ?? null,
      })),
      invoices: (client.invoices ?? []).map((invoice) => ({
        id: invoice.id.toString(), invoice_number: invoice.invoice_number,
        issue_date: invoice.issue_date.toISOString().slice(0, 10), due_date: invoice.due_date.toISOString().slice(0, 10),
        total_amount: invoice.total_amount.toString(), status: invoice.status ?? 'DRAFT',
      })),
    } : {}),
  };
}
function clientWhereFor(actor) {
  if (admins.has(actor.role)) return {};
  if (actor.role === 'CLIENT') return { user_id: BigInt(actor.id) };
  throw new HttpError(403, 'You are not authorized to access clients.');
}
function clientDetailsInclude() {
  return {
    users: { select: { id: true, name: true, email: true, created_at: true, is_active: true } },
    sites: {
      orderBy: { id: 'desc' },
      include: {
        supervisors: { include: { users: { select: { id: true, name: true } } } },
        assignments: { where: { status: 'ACTIVE' }, select: { guard_id: true } },
      },
    },
    invoices: { orderBy: { issue_date: 'desc' }, take: 10, select: { id: true, invoice_number: true, issue_date: true, due_date: true, total_amount: true, status: true } },
    _count: { select: { sites: true } },
  };
}

export async function listClients(actor, filters) {
  const scope = clientWhereFor(actor);
  const conditions = [scope];
  if (filters.status === 'ACTIVE') conditions.push({ status: 'ACTIVE', users: { is: { is_active: true } } });
  if (filters.status === 'INACTIVE') conditions.push({ OR: [{ status: 'INACTIVE' }, { users: { is: { is_active: false } } }] });
  if (filters.search) conditions.push({ OR: [
      { company_name: { contains: filters.search } }, { contact_person: { contains: filters.search } },
      { company_email: { contains: filters.search } }, { phone: { contains: filters.search } },
      { users: { is: { email: { contains: filters.search } } } }, { users: { is: { name: { contains: filters.search } } } },
    ] });
  const present = conditions.filter((condition) => Object.keys(condition).length > 0);
  const where = present.length > 1 ? { AND: present } : present[0] ?? {};
  const [rows, total] = await Promise.all([
    prisma.clients.findMany({ where, orderBy: { company_name: 'asc' }, skip: (filters.page - 1) * filters.pageSize, take: filters.pageSize,
      include: { users: { select: { name: true, email: true, created_at: true } }, _count: { select: { sites: true } } } }),
    prisma.clients.count({ where }),
  ]);
  return { clients: rows.map((row) => safeClient(row)), pagination: pagination(filters, total) };
}

export async function getClient(actor, value) {
  const id = parseAccountId(value);
  if (!id) throw new HttpError(400, 'A valid client ID is required.');
  const client = await prisma.clients.findFirst({ where: { id, ...clientWhereFor(actor) }, include: clientDetailsInclude() });
  if (!client) throw new HttpError(404, 'Client not found.');
  return safeClient(client, { includeRelations: true });
}

export async function getMyClient(actor) {
  if (actor.role !== 'CLIENT') throw new HttpError(403, 'Client profile access is restricted.');
  const client = await prisma.clients.findUnique({ where: { user_id: BigInt(actor.id) }, include: clientDetailsInclude() });
  if (!client) throw new HttpError(404, 'Client not found.');
  return safeClient(client, { includeRelations: true });
}

export async function getClientForUser(actor, userId) {
  const client = await prisma.clients.findUnique({ where: { user_id: BigInt(userId) }, select: { id: true } });
  if (!client) throw new HttpError(404, 'Client not found.');
  return getClient(actor, client.id.toString());
}

export async function updateClient({ actor, clientId, input }) {
  const id = parseAccountId(clientId);
  if (!id) throw new HttpError(400, 'A valid client ID is required.');
  const scope = { id, ...clientWhereFor(actor) };
  try {
    await prisma.$transaction(async (tx) => {
      const current = await tx.clients.findFirst({ where: scope, include: { users: true } });
      if (!current) throw new HttpError(404, 'Client not found.');
      const userData = {};
      const clientData = {};
      if (Object.hasOwn(input, 'name')) userData.name = input.name;
      if (Object.hasOwn(input, 'email')) {
        const email = normalizeEmail(input.email);
        const duplicates = await tx.$queryRaw`SELECT id FROM users WHERE LOWER(TRIM(email)) = ${email} AND id <> ${current.user_id} LIMIT 1`;
        if (duplicates.length) throw new HttpError(409, 'An account with that email already exists.');
        userData.email = email;
      }
      if (Object.hasOwn(input, 'phone')) userData.phone = input.phone;
      for (const field of ['company_name', 'contact_person', 'company_email', 'phone', 'billing_address', 'gstin']) {
        if (Object.hasOwn(input, field)) clientData[field] = input[field];
      }
      if (Object.keys(userData).length) await tx.users.update({ where: { id: current.user_id }, data: { ...userData, updated_at: nextAuthVersion(current.users.updated_at) } });
      if (Object.keys(clientData).length) await tx.clients.update({ where: { id }, data: clientData });
      await tx.audit_logs.create({ data: { user_id: BigInt(actor.id), action: 'CLIENT_UPDATED', entity_type: 'CLIENT', entity_id: id, details: { changedFields: Object.keys(input).sort() } } });
    });
  } catch (error) {
    if (error?.code === 'P2002') throw new HttpError(409, 'A client account with that email already exists.');
    throw error;
  }
  return getClient(actor, id.toString());
}

export async function updateClientStatus({ actorId, clientId, status }) {
  const id = parseAccountId(clientId);
  if (!id) throw new HttpError(400, 'A valid client ID is required.');
  await prisma.$transaction(async (tx) => {
    const client = await tx.clients.findUnique({ where: { id }, include: { users: { select: { updated_at: true } } } });
    if (!client) throw new HttpError(404, 'Client not found.');
    await tx.clients.update({ where: { id }, data: { status } });
    await tx.users.update({ where: { id: client.user_id }, data: { is_active: status === 'ACTIVE', updated_at: nextAuthVersion(client.users.updated_at) } });
    await tx.audit_logs.create({ data: { user_id: BigInt(actorId), action: 'CLIENT_STATUS_CHANGED', entity_type: 'CLIENT', entity_id: id, details: { from: client.status ?? 'ACTIVE', to: status } } });
  });
}
