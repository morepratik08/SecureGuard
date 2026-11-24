import { apiClient } from './client.js'

export async function getClients(params) { return (await apiClient.get('/clients', { params })).data }
export async function getClient(id) { return (await apiClient.get(`/clients/${encodeURIComponent(id)}`)).data.client }
export async function getMyClient() { return (await apiClient.get('/clients/me')).data.client }
export async function createClient(client) { return (await apiClient.post('/clients', client)).data.client }
export async function updateClient(id, fields) { return (await apiClient.put(`/clients/${encodeURIComponent(id)}`, fields)).data.client }
export async function updateClientStatus(id, status) { return apiClient.patch(`/clients/${encodeURIComponent(id)}/status`, { status }) }
export async function getSites(params) { return (await apiClient.get('/sites', { params })).data }
export async function getSite(id) { return (await apiClient.get(`/sites/${encodeURIComponent(id)}`)).data.site }
export async function getSiteOptions() { return (await apiClient.get('/sites/options')).data.options }
export async function createSite(site) { return (await apiClient.post('/sites', site)).data.site }
export async function updateSite(id, fields) { return (await apiClient.put(`/sites/${encodeURIComponent(id)}`, fields)).data.site }
export async function updateSiteStatus(id, status) { return (await apiClient.patch(`/sites/${encodeURIComponent(id)}/status`, { status })).data.site }
export async function getShifts(params) { return (await apiClient.get('/shifts', { params })).data }
export async function getShift(id) { return (await apiClient.get(`/shifts/${encodeURIComponent(id)}`)).data.shift }
export async function createShift(shift) { return (await apiClient.post('/shifts', shift)).data.shift }
export async function updateShift(id, fields) { return (await apiClient.put(`/shifts/${encodeURIComponent(id)}`, fields)).data.shift }
export async function updateShiftStatus(id, isActive) { return (await apiClient.patch(`/shifts/${encodeURIComponent(id)}/status`, { is_active: isActive })).data.shift }
export async function getAssignmentOptions() { return (await apiClient.get('/assignments/options')).data.options }
export async function getAssignments(params) { return (await apiClient.get('/assignments', { params })).data }
export async function getAssignment(id) { return (await apiClient.get(`/assignments/${encodeURIComponent(id)}`)).data.assignment }
export async function createAssignment(assignment) { return (await apiClient.post('/assignments', assignment)).data.assignment }
export async function updateAssignment(id, fields) { return (await apiClient.put(`/assignments/${encodeURIComponent(id)}`, fields)).data.assignment }
export async function endAssignment(id, endDate) { return (await apiClient.patch(`/assignments/${encodeURIComponent(id)}/end`, { ...(endDate ? { end_date: endDate } : {}) })).data.assignment }
export async function getSchedule(params) { return (await apiClient.get('/schedule', { params })).data }
