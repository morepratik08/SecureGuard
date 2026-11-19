import { createAccount, resetPassword } from '../services/account.service.js';
import { validateAccountCreation, validatePasswordReset, parseAccountId } from '../validators/account.validator.js';
import { HttpError } from '../utils/http-error.js';

export async function createAccountController(req, res) {
  const input = validateAccountCreation(req.body, req.user.role);
  const auditActorId = ['GUARD', 'SUPERVISOR', 'CLIENT'].includes(input.role) ? req.user.id : undefined;
  const user = await createAccount(input, { auditActorId });
  res.status(201).json({ success: true, user });
}

export async function resetPasswordController(req, res) {
  const targetId = parseAccountId(req.params.userId);
  if (!targetId) throw new HttpError(400, 'A valid account ID is required.');

  const { newPassword } = validatePasswordReset(req.body);
  await resetPassword({
    actorRole: req.user.role,
    actorId: req.user.id,
    targetId: targetId.toString(),
    newPassword,
  });
  res.json({ success: true, message: 'Password reset successfully.' });
}
