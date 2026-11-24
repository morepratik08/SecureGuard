import prisma from '../config/prisma.js';
import { HttpError } from '../utils/http-error.js';
import { parseAccountId } from '../validators/account.validator.js';

const ADMIN_ROLES = new Set(['SUPER_ADMIN', 'ADMIN']);
const documentInclude = { guards: { select: { id: true, employee_code: true, users: { select: { id: true, name: true } } } } };
function pageInfo(filters, total) { return { page: filters.page, pageSize: filters.pageSize, total, totalPages: Math.ceil(total / filters.pageSize) }; }
function safeDocument(row) {
  return {
    id: row.id.toString(), document_type: row.document_type,
    verification_status: row.verification_status ?? 'PENDING',
    uploaded_at: row.uploaded_at?.toISOString() ?? null,
    expiry_date: null, expiry_status: 'NOT_TRACKED',
    file_available: false,
    guard: { id: row.guards.users.id.toString(), profile_id: row.guards.id.toString(), name: row.guards.users.name, employee_code: row.guards.employee_code },
  };
}
function parseId(value) {
  const id = parseAccountId(String(value));
  if (!id) throw new HttpError(400, 'A valid document ID is required.');
  return id;
}
async function guardIdsForSupervisor(actor, client = prisma) {
  const supervisor = await client.supervisors.findUnique({ where: { user_id: BigInt(actor.id) }, select: { id: true } });
  if (!supervisor) throw new HttpError(403, 'Supervisor profile is required.');
  const assignments = await client.assignments.findMany({ where: { sites: { is: { supervisor_id: supervisor.id } } }, select: { guard_id: true } });
  return [...new Set(assignments.map((row) => row.guard_id))];
}
async function scope(actor, client = prisma) {
  if (ADMIN_ROLES.has(actor.role)) return {};
  if (actor.role === 'GUARD') {
    const guard = await client.guards.findUnique({ where: { user_id: BigInt(actor.id) }, select: { id: true } });
    if (!guard) throw new HttpError(403, 'Guard profile is required.');
    return { guard_id: guard.id };
  }
  if (actor.role === 'SUPERVISOR') return { guard_id: { in: await guardIdsForSupervisor(actor, client) } };
  throw new HttpError(403, 'You are not authorized to access employee documents.');
}

export async function listDocuments(actor, filters) {
  const where = {
    ...(await scope(actor)),
    ...(filters.guardId ? { guard_id: filters.guardId } : {}),
    ...(filters.verificationStatus ? { verification_status: filters.verificationStatus } : {}),
    ...(filters.search ? { OR: [
      { document_type: { contains: filters.search } },
      { guards: { is: { employee_code: { contains: filters.search } } } },
      { guards: { is: { users: { is: { name: { contains: filters.search } } } } } },
    ] } : {}),
  };
  const [rows, total] = await Promise.all([
    prisma.documents.findMany({ where, orderBy: [{ uploaded_at: 'desc' }, { id: 'desc' }], skip: (filters.page - 1) * filters.pageSize, take: filters.pageSize, include: documentInclude }),
    prisma.documents.count({ where }),
  ]);
  return { documents: rows.map(safeDocument), pagination: pageInfo(filters, total) };
}

export async function getDocument(actor, value) {
  const id = parseId(value);
  const row = await prisma.documents.findFirst({ where: { id, ...(await scope(actor)) }, include: documentInclude });
  if (!row) throw new HttpError(404, 'Document not found.');
  return safeDocument(row);
}

export async function updateDocument({ actor, documentId, input }) {
  if (!ADMIN_ROLES.has(actor.role)) throw new HttpError(403, 'Only administrators can update employee document metadata.');
  const id = parseId(documentId);
  const existing = await prisma.documents.findUnique({ where: { id }, select: { id: true } });
  if (!existing) throw new HttpError(404, 'Document not found.');
  await prisma.$transaction(async (tx) => {
    const rows = await tx.$queryRaw`SELECT id FROM documents WHERE id = ${id} FOR UPDATE`;
    if (!rows[0]) throw new HttpError(404, 'Document not found.');
    await tx.documents.update({ where: { id }, data: input });
    await tx.audit_logs.create({ data: { user_id: BigInt(actor.id), action: 'DOCUMENT_METADATA_UPDATED', entity_type: 'DOCUMENT', entity_id: id, details: { changedFields: Object.keys(input).sort() } } });
  });
  return getDocument(actor, id.toString());
}

export async function documentExpirySummary(actor) {
  const where = await scope(actor);
  const [total, verified, pending, rejected] = await Promise.all([
    prisma.documents.count({ where }),
    prisma.documents.count({ where: { ...where, verification_status: 'VERIFIED' } }),
    prisma.documents.count({ where: { ...where, verification_status: 'PENDING' } }),
    prisma.documents.count({ where: { ...where, verification_status: 'REJECTED' } }),
  ]);
  return { total, verified, pending, rejected, expired: null, expiring_soon: null, expiry_tracking: false };
}

export const STORAGE_UNAVAILABLE_MESSAGE = 'Secure document storage is not configured. Upload and file delivery are unavailable.';
