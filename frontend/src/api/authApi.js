import { apiClient } from './client.js'

export async function loginRequest(credentials) {
  const { data } = await apiClient.post('/auth/login', credentials)
  return data
}

export async function getCurrentUser() {
  const { data } = await apiClient.get('/auth/me')
  return data.user
}
