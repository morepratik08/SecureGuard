import { checkIn, checkOut, attendanceDashboard, generateAbsences, getAttendance, listAttendance, verifyAttendance } from '../services/attendance.service.js';
import { validateAbsenceGeneration, validateAttendanceListQuery, validateCheckIn } from '../validators/attendance.validator.js';
import { parseAccountId } from '../validators/account.validator.js';
import { HttpError } from '../utils/http-error.js';

export async function checkInController(req, res) {
  const { assignmentId } = validateCheckIn(req.body);
  const attendance = await checkIn({ userId: req.user.id, assignmentId });
  res.status(201).json({ success: true, attendance });
}

export async function checkOutController(req, res) {
  const id = parseAccountId(req.params.attendanceId);
  if (!id) throw new HttpError(400, 'A valid attendance ID is required.');
  const attendance = await checkOut({ userId: req.user.id, attendanceId: id.toString() });
  res.json({ success: true, attendance });
}

export async function listAttendanceController(req, res) {
  res.json({ success: true, ...(await listAttendance(req.user, validateAttendanceListQuery(req.query))) });
}

export async function myAttendanceController(req, res) {
  res.json({ success: true, ...(await listAttendance(req.user, validateAttendanceListQuery(req.query))) });
}

export async function getAttendanceController(req, res) {
  const id = parseAccountId(req.params.attendanceId);
  if (!id) throw new HttpError(400, 'A valid attendance ID is required.');
  res.json({ success: true, attendance: await getAttendance(req.user, id.toString()) });
}

export async function verifyAttendanceController(req, res) {
  if (req.body && (typeof req.body !== 'object' || Array.isArray(req.body) || Object.keys(req.body).length > 0)) {
    throw new HttpError(400, 'Attendance verification does not accept request fields.');
  }
  const id = parseAccountId(req.params.attendanceId);
  if (!id) throw new HttpError(400, 'A valid attendance ID is required.');
  res.json({ success: true, attendance: await verifyAttendance({ actorId: req.user.id, attendanceId: id.toString() }) });
}

export async function generateAbsencesController(req, res) {
  const attendanceDate = validateAbsenceGeneration(req.body);
  res.json({ success: true, result: await generateAbsences({ actor: req.user, attendanceDate }) });
}

export async function attendanceDashboardController(req, res) {
  res.json({ success: true, dashboard: await attendanceDashboard(req.user) });
}
