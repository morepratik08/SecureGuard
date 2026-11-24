import { createIncident, getIncident, incidentSummary, listIncidentReportSites, listIncidents, updateIncident, updateIncidentStatus } from '../services/incident.service.js';
import { validateIncidentCreate, validateIncidentListQuery, validateIncidentStatus, validateIncidentUpdate } from '../validators/incident.validator.js';
import { parseAccountId } from '../validators/account.validator.js';
import { HttpError } from '../utils/http-error.js';

export async function listIncidentsController(req, res) {
  res.json({ success: true, ...(await listIncidents(req.user, validateIncidentListQuery(req.query))) });
}
export async function createIncidentController(req, res) {
  const incident = await createIncident({ actor: req.user, input: validateIncidentCreate(req.body) });
  res.status(201).json({ success: true, incident });
}
export async function getIncidentController(req, res) {
  const id = parseAccountId(req.params.incidentId);
  if (!id) throw new HttpError(400, 'A valid incident ID is required.');
  res.json({ success: true, incident: await getIncident(req.user, id.toString()) });
}
export async function updateIncidentController(req, res) {
  const incident = await updateIncident({ actor: req.user, incidentId: req.params.incidentId, input: validateIncidentUpdate(req.body) });
  res.json({ success: true, incident });
}
export async function updateIncidentStatusController(req, res) {
  const incident = await updateIncidentStatus({ actor: req.user, incidentId: req.params.incidentId, status: validateIncidentStatus(req.body) });
  res.json({ success: true, incident });
}
export async function incidentSummaryController(req, res) {
  res.json({ success: true, summary: await incidentSummary(req.user) });
}
export async function incidentReportSitesController(req, res) {
  res.json({ success: true, sites: await listIncidentReportSites(req.user) });
}
