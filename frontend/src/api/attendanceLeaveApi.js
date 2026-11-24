import { apiClient } from './client.js'

export async function getAttendance(params) { return (await apiClient.get('/attendance', { params })).data }
export async function getMyAttendance(params) { return (await apiClient.get('/attendance/me', { params })).data }
export async function getAttendanceRecord(id) { return (await apiClient.get(`/attendance/${encodeURIComponent(id)}`)).data.attendance }
export async function checkIn(assignmentId) { return (await apiClient.post('/attendance/check-in', { assignment_id: assignmentId })).data.attendance }
export async function checkOut(attendanceId) { return (await apiClient.patch(`/attendance/${encodeURIComponent(attendanceId)}/check-out`)).data.attendance }
export async function verifyAttendance(id) { return (await apiClient.patch(`/attendance/${encodeURIComponent(id)}/verify`)).data.attendance }
export async function generateAbsences(date) { return (await apiClient.post('/attendance/absences/generate', { date })).data.result }
export async function getAttendanceDashboard() { return (await apiClient.get('/attendance/dashboard')).data.dashboard }

export async function getLeaves(params) { return (await apiClient.get('/leaves', { params })).data }
export async function getMyLeaves(params) { return (await apiClient.get('/leaves/me', { params })).data }
export async function getLeave(id) { return (await apiClient.get(`/leaves/${encodeURIComponent(id)}`)).data.leave }
export async function applyForLeave(leave) { return (await apiClient.post('/leaves', leave)).data.leave }
export async function approveLeave(id) { return (await apiClient.patch(`/leaves/${encodeURIComponent(id)}/approve`)).data.leave }
export async function rejectLeave(id) { return (await apiClient.patch(`/leaves/${encodeURIComponent(id)}/reject`)).data.leave }
