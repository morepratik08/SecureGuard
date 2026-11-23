import { createAssignment, endAssignment, getAssignment, getAssignmentOptions, listAssignments, schedule, updateAssignment } from '../services/assignment.service.js';
import { validateAssignmentEnd, validateAssignmentInput, validateAssignmentListQuery } from '../validators/assignment.validator.js';
import { parseAccountId } from '../validators/account.validator.js';
import { HttpError } from '../utils/http-error.js';

export async function listAssignmentsController(req, res) {
  res.json({ success: true, ...(await listAssignments(req.user, validateAssignmentListQuery(req.query))) });
}
export async function assignmentOptionsController(req, res) {
  res.json({ success: true, options: await getAssignmentOptions(req.user) });
}
export async function createAssignmentController(req, res) {
  const assignment = await createAssignment({ actorId: req.user.id, input: validateAssignmentInput(req.body) });
  res.status(201).json({ success: true, assignment });
}
export async function getAssignmentController(req, res) {
  const id = parseAccountId(req.params.assignmentId);
  if (!id) throw new HttpError(400, 'A valid assignment ID is required.');
  res.json({ success: true, assignment: await getAssignment(req.user, id.toString()) });
}
export async function updateAssignmentController(req, res) {
  const id = parseAccountId(req.params.assignmentId);
  if (!id) throw new HttpError(400, 'A valid assignment ID is required.');
  const assignment = await updateAssignment({ actorId: req.user.id, assignmentId: id.toString(), input: validateAssignmentInput(req.body, { partial: true }) });
  res.json({ success: true, assignment });
}
export async function endAssignmentController(req, res) {
  const id = parseAccountId(req.params.assignmentId);
  if (!id) throw new HttpError(400, 'A valid assignment ID is required.');
  const assignment = await endAssignment({ actorId: req.user.id, assignmentId: id.toString(), endDate: validateAssignmentEnd(req.body) });
  res.json({ success: true, assignment });
}
export async function scheduleController(req, res) {
  res.json({ success: true, ...(await schedule(req.user, validateAssignmentListQuery(req.query, { schedule: true }))) });
}
