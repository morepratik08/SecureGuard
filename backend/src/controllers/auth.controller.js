import { getCurrentUser, login } from '../services/auth.service.js';
import { changePassword } from '../services/account.service.js';
import { validateLoginInput } from '../validators/auth.validator.js';
import { validatePasswordChange } from '../validators/account.validator.js';

export async function loginController(req, res) {
  const credentials = validateLoginInput(req.body);
  const result = await login(credentials);
  res.json({ success: true, ...result });
}

export async function currentUserController(req, res) {
  const user = await getCurrentUser(req.user.id);
  res.json({ success: true, user });
}

export async function changePasswordController(req, res) {
  const input = validatePasswordChange(req.body);
  await changePassword({ userId: req.user.id, ...input });
  res.json({ success: true, message: 'Password changed successfully.' });
}
