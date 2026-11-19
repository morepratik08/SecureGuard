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
