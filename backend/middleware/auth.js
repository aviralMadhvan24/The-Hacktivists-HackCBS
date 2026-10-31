// Session authentication. Accepts the httpOnly cookie used by the web app, or
// an Authorization: Bearer token for API clients (e.g. the iOS app).
//
// CSRF: cookie-authenticated state-changing requests must carry the
// X-LOS-CSRF header. Browsers cannot add custom headers cross-site without a
// CORS preflight, and CORS only allows configured origins.
const authService = require('../services/authService');
const { unauthorized, HttpError, wrap } = require('../lib/http');

const COOKIE_NAME = 'los_session';
const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

function readToken(req) {
  const header = req.headers.authorization;
  if (header && header.startsWith('Bearer ')) return { token: header.slice(7).trim(), via: 'bearer' };
  if (req.cookies && req.cookies[COOKIE_NAME]) return { token: req.cookies[COOKIE_NAME], via: 'cookie' };
  return { token: null, via: null };
}

const requireAuth = wrap(async (req, res, next) => {
  const { token, via } = readToken(req);
  if (!token) throw unauthorized();
  const user = await authService.verifyToken(token);
  if (!user) throw new HttpError(401, 'SESSION_EXPIRED', 'Your session has expired. Please sign in again.');
  if (via === 'cookie' && !SAFE_METHODS.has(req.method) && req.get('X-LOS-CSRF') !== '1') {
    throw new HttpError(403, 'CSRF_CHECK_FAILED', 'Missing X-LOS-CSRF header.');
  }
  req.user = user;
  req.sessionToken = token;
  next();
});

function sessionCookieOptions(expiresAt) {
  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production' || process.env.COOKIE_SECURE === 'true',
    sameSite: 'lax',
    path: '/',
    expires: expiresAt,
  };
}

function clientMeta(req) {
  return { ip: req.ip, userAgent: req.get('user-agent') };
}

module.exports = { requireAuth, readToken, sessionCookieOptions, clientMeta, COOKIE_NAME };
