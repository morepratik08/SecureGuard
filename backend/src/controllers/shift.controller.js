import { createShift, getShift, listShifts, updateShift, updateShiftStatus } from '../services/shift.service.js';
import { validateShiftInput, validateShiftListQuery, validateShiftStatus } from '../validators/shift.validator.js';
import { parseAccountId } from '../validators/account.validator.js';
import { HttpError } from '../utils/http-error.js';

export async function listShiftsController(req, res) {
  res.json({ success: true, ...(await listShifts(validateShiftListQuery(req.query))) });
}
export async function createShiftController(req, res) {
  const shift = await createShift({ actorId: req.user.id, input: validateShiftInput(req.body) });
  res.status(201).json({ success: true, shift });
}
export async function getShiftController(req, res) {
  const id = parseAccountId(req.params.shiftId);
  if (!id) throw new HttpError(400, 'A valid shift ID is required.');
  res.json({ success: true, shift: await getShift(id.toString()) });
}
export async function updateShiftController(req, res) {
  const id = parseAccountId(req.params.shiftId);
  if (!id) throw new HttpError(400, 'A valid shift ID is required.');
  const shift = await updateShift({ actorId: req.user.id, shiftId: id.toString(), input: validateShiftInput(req.body, { partial: true }) });
  res.json({ success: true, shift });
}
export async function updateShiftStatusController(req, res) {
  const id = parseAccountId(req.params.shiftId);
  if (!id) throw new HttpError(400, 'A valid shift ID is required.');
  const shift = await updateShiftStatus({ actorId: req.user.id, shiftId: id.toString(), isActive: validateShiftStatus(req.body?.is_active) });
  res.json({ success: true, shift });
}
