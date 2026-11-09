import { HttpError } from '../utils/http-error.js';
import { normalizeEmail } from '../utils/normalize-email.js';

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function validateLoginInput(body) {
  const email = typeof body?.email === 'string' ? normalizeEmail(body.email) : '';
  const password = typeof body?.password === 'string' ? body.password : '';

  if (!email || email.length > 150 || !EMAIL_PATTERN.test(email)) {
    throw new HttpError(400, 'A valid email and password are required.');
  }

  if (!password || Buffer.byteLength(password, 'utf8') > 72) {
    throw new HttpError(400, 'A valid email and password are required.');
  }

  return { email, password };
}
