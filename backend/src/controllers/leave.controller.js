import { approveLeave, applyLeave, getLeave, listLeaves, rejectLeave } from '../services/leave.service.js';
import { validateLeaveDecisionBody, validateLeaveInput, validateLeaveListQuery } from '../validators/leave.validator.js';
import { parseAccountId } from '../validators/account.validator.js';
import { HttpError } from '../utils/http-error.js';

export async function applyLeaveController(req, res) {
  const leave = await applyLeave({ userId: req.user.id, input: validateLeaveInput(req.body) });
  res.status(201).json({ success: true, leave });
}

export async function listLeavesController(req, res) {
  res.json({ success: true, ...(await listLeaves(req.user, validateLeaveListQuery(req.query))) });
}

export async function myLeavesController(req, res) {
  res.json({ success: true, ...(await listLeaves(req.user, validateLeaveListQuery(req.query))) });
}

export async function getLeaveController(req, res) {
  const id = parseAccountId(req.params.leaveId);
  if (!id) throw new HttpError(400, 'A valid leave ID is required.');
  res.json({ success: true, leave: await getLeave(req.user, id.toString()) });
}

export async function approveLeaveController(req, res) {
  validateLeaveDecisionBody(req.body);
  const id = parseAccountId(req.params.leaveId);
  if (!id) throw new HttpError(400, 'A valid leave ID is required.');
  res.json({ success: true, leave: await approveLeave({ actorId: req.user.id, leaveId: id.toString() }) });
}

export async function rejectLeaveController(req, res) {
  validateLeaveDecisionBody(req.body);
  const id = parseAccountId(req.params.leaveId);
  if (!id) throw new HttpError(400, 'A valid leave ID is required.');
  res.json({ success: true, leave: await rejectLeave({ actorId: req.user.id, leaveId: id.toString() }) });
}
