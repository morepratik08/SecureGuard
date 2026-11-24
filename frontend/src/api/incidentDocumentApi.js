import { apiClient } from './client.js'

export async function getIncidents(params) { return (await apiClient.get('/incidents', { params })).data }
export async function getIncident(id) { return (await apiClient.get(`/incidents/${encodeURIComponent(id)}`)).data.incident }
export async function createIncident(fields) { return (await apiClient.post('/incidents', fields)).data.incident }
export async function updateIncident(id, fields) { return (await apiClient.patch(`/incidents/${encodeURIComponent(id)}`, fields)).data.incident }
export async function updateIncidentStatus(id, status) { return (await apiClient.patch(`/incidents/${encodeURIComponent(id)}/status`, { status })).data.incident }
export async function getIncidentSummary() { return (await apiClient.get('/incidents/summary')).data.summary }
export async function getIncidentReportSites() { return (await apiClient.get('/incidents/sites')).data.sites }

export async function getDocuments(params) { return (await apiClient.get('/documents', { params })).data }
export async function getDocument(id) { return (await apiClient.get(`/documents/${encodeURIComponent(id)}`)).data.document }
export async function updateDocument(id, fields) { return (await apiClient.patch(`/documents/${encodeURIComponent(id)}`, fields)).data.document }
export async function getDocumentSummary() { return (await apiClient.get('/documents/summary')).data.summary }
