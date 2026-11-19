import { apiClient } from './client.js'

// The current backend exposes /health but does not yet expose dashboard metrics.
// Keep dashboard data behind this service so the UI can switch to a real endpoint
// without embedding transport logic in chart and card components.
export async function getDashboardConnectionStatus() {
  const { data } = await apiClient.get('/health')
  return data
}
