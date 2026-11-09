import jwt from 'jsonwebtoken';
import { HttpError } from '../utils/http-error.js';
import { getAuthVersion, getUserAuthenticationContext, isProfileAllowed, parseUserId, verifyAccessToken } from '../services/auth.service.js';

const USER_ROLES = new Set(['SUPER_ADMIN', 'ADMIN', 'SUPERVISOR', 'GUARD', 'CLIENT']);

export async function authenticate(req, res, next) {
  const authorization = req.get('authorization');
  const match = typeof authorization === 'string'
    ? authorization.match(/^Bearer\s+([^\s]+)$/i)
    : null;

  if (!match) {
    return next(new HttpError(401, 'Authentication token is required.'));
  }

  try {
    const claims = verifyAccessToken(match[1]);
    const id = parseUserId(claims?.sub);
    if (!id || !USER_ROLES.has(claims?.role)) {
      throw new HttpError(401, 'Invalid authentication token.');
    }

    const user = await getUserAuthenticationContext(id.toString());
    if (!user
      || user.is_active !== true
      || user.role !== claims.role
      || claims.av !== getAuthVersion(user.updated_at)
      || !isProfileAllowed(user)) {
      return next(new HttpError(401, 'Authentication required.'));
    }

    req.user = { id: id.toString(), role: user.role };
    return next();
  } catch (error) {
    if (error instanceof HttpError) return next(error);
    if (error instanceof jwt.TokenExpiredError) {
      return next(new HttpError(401, 'Authentication token has expired.'));
    }
    if (error instanceof jwt.JsonWebTokenError || error instanceof jwt.NotBeforeError) {
      return next(new HttpError(401, 'Invalid authentication token.'));
    }
    return next(error);
  }
}

export function authorizeRoles(...permittedRoles) {
  const allowedRoles = new Set(permittedRoles);
  return (req, res, next) => {
    if (!req.user) {
      return next(new HttpError(401, 'Authentication is required.'));
    }
    if (!allowedRoles.has(req.user.role)) {
      return next(new HttpError(403, 'You are not authorized to access this resource.'));
    }
    return next();
  };
}
