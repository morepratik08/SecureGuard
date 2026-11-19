import { apiClient } from './client.js'

export async function getEmployees(params) {
  const { data } = await apiClient.get('/employees', { params })
  return data
}

export async function getEmployeeSummary() {
  const { data } = await apiClient.get('/employees/summary')
  return data.summary
}

export async function getEmployee(employeeId) {
  const { data } = await apiClient.get(`/employees/${encodeURIComponent(employeeId)}`)
  return data.employee
}

export async function getMyEmployeeProfile() {
  const { data } = await apiClient.get('/employees/me')
  return data.employee
}

export async function createEmployee(employee) {
  const { data } = await apiClient.post('/employees', employee)
  return data.employee
}

export async function updateEmployee(employeeId, changes) {
  const { data } = await apiClient.patch(`/employees/${encodeURIComponent(employeeId)}`, changes)
  return data.employee
}

export async function updateEmployeeStatus(employeeId, status) {
  const { data } = await apiClient.patch(`/employees/${encodeURIComponent(employeeId)}/status`, { status })
  return data.employee
}
