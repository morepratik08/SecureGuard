import {
  getEmployeeById,
  getEmployeeSummary,
  getMyEmployeeProfile,
  listEmployees,
  updateEmployeeProfile,
  updateEmployeeStatus,
} from '../services/employee.service.js';
import { createAccount } from '../services/account.service.js';
import {
  validateEmployeeCreation,
  validateEmployeeListQuery,
  validateEmployeeStatus,
  validateEmployeeUpdate,
} from '../validators/employee.validator.js';
import { parseAccountId } from '../validators/account.validator.js';
import { HttpError } from '../utils/http-error.js';

export async function listEmployeesController(req, res) {
  const filters = validateEmployeeListQuery(req.query, req.user.role);
  const result = await listEmployees(req.user, filters);
  res.json({ success: true, ...result });
}

export async function employeeSummaryController(req, res) {
  const summary = await getEmployeeSummary(req.user);
  res.json({ success: true, summary });
}

export async function myEmployeeProfileController(req, res) {
  const employee = await getMyEmployeeProfile(req.user);
  res.json({ success: true, employee });
}

export async function getEmployeeController(req, res) {
  const employeeId = parseAccountId(req.params.employeeId);
  if (!employeeId) throw new HttpError(400, 'A valid employee ID is required.');
  const employee = await getEmployeeById(req.user, employeeId.toString());
  res.json({ success: true, employee });
}

export async function createEmployeeController(req, res) {
  const input = validateEmployeeCreation(req.body, req.user.role);
  const employee = await createAccount(input, { auditActorId: req.user.id });
  res.status(201).json({ success: true, employee });
}

export async function updateEmployeeController(req, res) {
  const employeeId = parseAccountId(req.params.employeeId);
  if (!employeeId) throw new HttpError(400, 'A valid employee ID is required.');
  const current = await getEmployeeById(req.user, employeeId.toString());
  const input = validateEmployeeUpdate(req.body, current.role);
  const employee = await updateEmployeeProfile({
    actorId: req.user.id,
    actorRole: req.user.role,
    employeeId: employeeId.toString(),
    input,
  });
  res.json({ success: true, employee });
}

export async function updateEmployeeStatusController(req, res) {
  const employeeId = parseAccountId(req.params.employeeId);
  if (!employeeId) throw new HttpError(400, 'A valid employee ID is required.');
  const current = await getEmployeeById(req.user, employeeId.toString());
  const status = validateEmployeeStatus(current.role, req.body?.status);
  const employee = await updateEmployeeStatus({
    actorId: req.user.id,
    actorRole: req.user.role,
    employeeId: employeeId.toString(),
    status,
  });
  res.json({ success: true, employee });
}
