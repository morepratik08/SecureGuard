import assert from 'node:assert/strict';
import { test } from 'node:test';
import prisma from '../src/config/prisma.js';
import { canTransitionIncident, createIncident, listIncidents, updateIncidentStatus } from '../src/services/incident.service.js';
import { listDocuments } from '../src/services/document.service.js';
import { uploadDocumentController } from '../src/controllers/document.controller.js';
import { validateIncidentCreate, validateIncidentListQuery, validateIncidentStatus, validateIncidentUpdate } from '../src/validators/incident.validator.js';
import { validateDocumentListQuery, validateDocumentUpdate } from '../src/validators/document.validator.js';

const original = {
  transaction: prisma.$transaction,
  sitesFindUnique: prisma.sites.findUnique,
  incidentsFindFirst: prisma.incidents.findFirst,
  incidentsFindMany: prisma.incidents.findMany,
  incidentsCount: prisma.incidents.count,
  auditFindMany: prisma.audit_logs.findMany,
  supervisorsFindUnique: prisma.supervisors.findUnique,
  clientsFindUnique: prisma.clients.findUnique,
  guardsFindUnique: prisma.guards.findUnique,
  documentsFindMany: prisma.documents.findMany,
  documentsCount: prisma.documents.count,
};

test('incident validators accept schema fields and reject client-controlled reporter/status data', () => {
  const input = validateIncidentCreate({ site_id: '42', incident_title: 'Gate alarm', description: 'Alarm triggered at the north entrance.', incident_time: '2026-11-24T11:30:00+05:30', severity: 'HIGH' });
  assert.equal(input.site_id, 42n);
  assert.equal(input.severity, 'HIGH');
  assert.throws(() => validateIncidentCreate({ ...{ site_id: '42', incident_title: 'Gate alarm', description: 'Details', incident_time: '2026-11-24T11:30:00Z' }, reported_by: '1' }), (error) => error.statusCode === 400);
  assert.throws(() => validateIncidentUpdate({ status: 'CLOSED' }), (error) => error.statusCode === 400);
  assert.throws(() => validateIncidentStatus({ status: 'UNDER_REVIEW' }), (error) => error.statusCode === 400);
  assert.equal(validateIncidentListQuery({ status: 'INVESTIGATING', severity: 'CRITICAL', page: '2' }).page, 2);
});

test('incident status transitions follow the schema workflow', () => {
  assert.equal(canTransitionIncident('OPEN', 'INVESTIGATING'), true);
  assert.equal(canTransitionIncident('INVESTIGATING', 'RESOLVED'), true);
  assert.equal(canTransitionIncident('RESOLVED', 'CLOSED'), true);
  assert.equal(canTransitionIncident('OPEN', 'CLOSED'), false);
  assert.equal(canTransitionIncident('CLOSED', 'OPEN'), false);
});

test('incident lists apply supervisor, client, and guard ownership scopes', async () => {
  const seen = [];
  prisma.supervisors.findUnique = async () => ({ id: 22n });
  prisma.clients.findUnique = async () => ({ id: 15n });
  prisma.incidents.findMany = async ({ where }) => { seen.push(where); return []; };
  prisma.incidents.count = async () => 0;
  const filters = { page: 1, pageSize: 20 };
  try {
    await listIncidents({ id: '2', role: 'SUPERVISOR' }, filters);
    await listIncidents({ id: '8', role: 'CLIENT' }, filters);
    await listIncidents({ id: '3', role: 'GUARD' }, filters);
    assert.deepEqual(seen[0].sites, { is: { supervisor_id: 22n } });
    assert.deepEqual(seen[1].sites, { is: { client_id: 15n } });
    assert.equal(seen[2].reported_by, 3n);
  } finally {
    prisma.supervisors.findUnique = original.supervisorsFindUnique;
    prisma.clients.findUnique = original.clientsFindUnique;
    prisma.clients.findUnique = original.clientsFindUnique;
    prisma.incidents.findMany = original.incidentsFindMany;
    prisma.incidents.count = original.incidentsCount;
  }
});

test('incident status update is scoped and audited', async () => {
  const audits = [];
  let currentStatus = 'OPEN';
  prisma.incidents.findFirst = async () => ({ id: 90n, incident_title: 'Test', description: 'Details', severity: 'LOW', status: currentStatus, incident_time: new Date('2026-11-24T06:00:00Z'), created_at: new Date('2026-11-24T06:00:00Z'), sites: { id: 42n, site_name: 'North Site' }, users: { id: 1n, name: 'Admin', role: 'ADMIN' } });
  prisma.audit_logs.findMany = async () => [];
  prisma.$transaction = async (callback) => callback({
    $queryRaw: async () => [{ id: 90n, status: currentStatus }],
    incidents: {
      findFirst: async () => ({ id: 90n }),
      update: async ({ data }) => { currentStatus = data.status; },
    },
    audit_logs: { create: async ({ data }) => { audits.push(data); } },
  });
  try {
    const updated = await updateIncidentStatus({ actor: { id: '1', role: 'ADMIN' }, incidentId: '90', status: 'INVESTIGATING' });
    assert.equal(currentStatus, 'INVESTIGATING');
    assert.equal(updated.status, 'INVESTIGATING');
    assert.equal(audits[0].action, 'INCIDENT_STATUS_CHANGED');
    assert.deepEqual(audits[0].details, { from: 'OPEN', to: 'INVESTIGATING' });
    await assert.rejects(updateIncidentStatus({ actor: { id: '3', role: 'GUARD' }, incidentId: '90', status: 'RESOLVED' }), (error) => error.statusCode === 403);
  } finally {
    prisma.$transaction = original.transaction;
    prisma.incidents.findFirst = original.incidentsFindFirst;
    prisma.audit_logs.findMany = original.auditFindMany;
  }
});

test('incident create uses authenticated reporter identity and writes audit in the transaction', async () => {
  const audits = [];
  let created;
  prisma.sites.findUnique = async () => ({ id: 42n, status: 'ACTIVE', supervisor_id: null, client_id: 7n });
  prisma.$transaction = async (callback) => callback({
    sites: { findUnique: prisma.sites.findUnique },
    incidents: { create: async ({ data }) => { created = { id: 90n, ...data, created_at: new Date('2026-11-24T06:00:00Z') }; return { id: 90n }; } },
    audit_logs: { create: async ({ data }) => { audits.push(data); } },
  });
  prisma.incidents.findFirst = async () => ({ ...created, sites: { id: 42n, site_name: 'North Site' }, users: { id: 2n, name: 'Supervisor', role: 'SUPERVISOR' } });
  prisma.audit_logs.findMany = async () => [];
  try {
    const incident = await createIncident({ actor: { id: '2', role: 'ADMIN' }, input: {
      site_id: 42n, incident_title: 'Gate alarm', description: 'Alarm triggered.', incident_time: new Date('2026-11-24T06:00:00Z'), severity: 'HIGH',
    } });
    assert.equal(created.reported_by, 2n);
    assert.equal(incident.reporter.id, '2');
    assert.equal(incident.status, 'OPEN');
    assert.equal(audits.length, 1);
    assert.equal(audits[0].action, 'INCIDENT_REPORTED');
    assert.equal(audits[0].entity_id, 90n);
  } finally {
    prisma.$transaction = original.transaction;
    prisma.sites.findUnique = original.sitesFindUnique;
    prisma.incidents.findFirst = original.incidentsFindFirst;
    prisma.audit_logs.findMany = original.auditFindMany;
  }
});

test('document API rejects unsafe URL/expiry fields and redacts stored file URLs', async () => {
  assert.throws(() => validateDocumentUpdate({ file_url: 'https://untrusted.example/file.pdf' }), (error) => error.statusCode === 400);
  assert.throws(() => validateDocumentUpdate({ expiry_date: '2026-12-01' }), (error) => error.statusCode === 400);
  assert.throws(() => validateDocumentUpdate({ verification_status: 'VERIFIED' }), (error) => error.statusCode === 400);
  assert.throws(() => validateDocumentListQuery({ expiry: 'expired' }, 'ADMIN'), (error) => error.statusCode === 400);
  assert.throws(() => validateDocumentListQuery({ guardId: '3' }, 'GUARD'), (error) => error.statusCode === 403);
  await assert.rejects(listDocuments({ id: '4', role: 'CLIENT' }, { page: 1, pageSize: 20 }), (error) => error.statusCode === 403);
  prisma.guards.findUnique = async () => ({ id: 31n });
  prisma.documents.findMany = async () => [{
    id: 11n, guard_id: 31n, document_type: 'Identity', file_url: 'https://private.example/secret',
    verification_status: 'PENDING', uploaded_at: new Date('2026-01-01T00:00:00Z'),
    guards: { id: 31n, employee_code: 'G-31', users: { id: 3n, name: 'Guard Name' } },
  }];
  prisma.documents.count = async () => 1;
  try {
    const result = await listDocuments({ id: '3', role: 'GUARD' }, { page: 1, pageSize: 20 });
    assert.equal(result.documents[0].file_available, false);
    assert.equal(result.documents[0].expiry_status, 'NOT_TRACKED');
    assert.equal(Object.hasOwn(result.documents[0], 'file_url'), false);
    let status; let payload;
    await uploadDocumentController({}, { status(value) { status = value; return this; }, json(value) { payload = value; return value; } });
    assert.equal(status, 503);
    assert.equal(payload.success, false);
  } finally {
    prisma.guards.findUnique = original.guardsFindUnique;
    prisma.documents.findMany = original.documentsFindMany;
    prisma.documents.count = original.documentsCount;
  }
});
