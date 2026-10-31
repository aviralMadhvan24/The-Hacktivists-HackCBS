const express = require('express');
const authService = require('../services/authService');
const { requireAuth, readToken, sessionCookieOptions, clientMeta, COOKIE_NAME } = require('../middleware/auth');
const { wrap, HttpError } = require('../lib/http');

const router = express.Router();

function toHttp(err) {
  if (err.code === 'EMAIL_EXISTS') return new HttpError(409, err.code, err.message);
  if (err.code === 'INVALID_CREDENTIALS') return new HttpError(401, err.code, err.message);
  if (err.code === 'VALIDATION') return new HttpError(400, 'VALIDATION_ERROR', err.message);
  return err;
}

// POST /api/auth/register
router.post('/register', wrap(async (req, res) => {
  try {
    const { email, password, name } = req.body || {};
    const result = await authService.registerUser({ email, password, name }, clientMeta(req));
    res.cookie(COOKIE_NAME, result.token, sessionCookieOptions(result.expiresAt));
    // token is also returned for non-browser clients; the web app relies on the cookie.
    res.status(201).json({ success: true, user: result.user, token: result.token, expiresAt: result.expiresAt });
  } catch (err) { throw toHttp(err); }
}));

// POST /api/auth/login
router.post('/login', wrap(async (req, res) => {
  try {
    const { email, password } = req.body || {};
    const result = await authService.loginUser({ email, password }, clientMeta(req));
    res.cookie(COOKIE_NAME, result.token, sessionCookieOptions(result.expiresAt));
    res.json({ success: true, user: result.user, token: result.token, expiresAt: result.expiresAt });
  } catch (err) { throw toHttp(err); }
}));

// GET /api/auth/session — 200 with user or null; lets the web app check
// sign-in state without producing a 401.
router.get('/session', wrap(async (req, res) => {
  const { token } = readToken(req);
  const user = token ? await authService.verifyToken(token) : null;
  res.json({ success: true, user });
}));

// GET /api/auth/me
router.get('/me', requireAuth, (req, res) => {
  res.json({ success: true, user: req.user });
});

// POST /api/auth/logout — idempotent; no CSRF header needed since it only ends a session.
router.post('/logout', wrap(async (req, res) => {
  const { token } = readToken(req);
  if (token) await authService.revokeToken(token);
  res.clearCookie(COOKIE_NAME, { path: '/' });
  res.json({ success: true });
}));

// POST /api/auth/password — change password and sign out everywhere.
router.post('/password', requireAuth, wrap(async (req, res) => {
  try {
    await authService.changePassword(req.user.id, req.body?.currentPassword, req.body?.newPassword);
    res.clearCookie(COOKIE_NAME, { path: '/' });
    res.json({ success: true, message: 'Password changed. Please sign in again.' });
  } catch (err) { throw toHttp(err); }
}));

module.exports = router;
