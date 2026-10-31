const express = require('express');
const router = express.Router();
const authService = require('../services/authService');

// POST /api/auth/register - Create a new user account in database
router.post('/register', (req, res) => {
  try {
    const { email, password, name } = req.body;
    const result = authService.registerUser({ email, password, name });
    res.status(201).json({
      success: true,
      message: 'Account successfully registered.',
      user: result.user,
      token: result.token
    });
  } catch (err) {
    const status = err.code === 'EMAIL_EXISTS' ? 409 : 400;
    res.status(status).json({
      success: false,
      error: err.code || 'REGISTRATION_FAILED',
      message: err.message
    });
  }
});

// POST /api/auth/login - Authenticate existing user with database credentials
router.post('/login', (req, res) => {
  try {
    const { email, password } = req.body;
    const result = authService.loginUser({ email, password });
    res.status(200).json({
      success: true,
      message: 'Login successful.',
      user: result.user,
      token: result.token
    });
  } catch (err) {
    const status = (err.code === 'USER_NOT_FOUND' || err.code === 'INVALID_PASSWORD') ? 401 : 400;
    res.status(status).json({
      success: false,
      error: err.code || 'LOGIN_FAILED',
      message: err.message
    });
  }
});

// GET /api/auth/me - Verify current session token
router.get('/me', (req, res) => {
  const authHeader = req.headers.authorization;
  const token = authHeader && authHeader.startsWith('Bearer ')
    ? authHeader.slice(7)
    : req.query.token;

  if (!token) {
    return res.status(401).json({
      success: false,
      error: 'UNAUTHORIZED',
      message: 'No authorization token provided.'
    });
  }

  const user = authService.verifyToken(token);
  if (!user) {
    return res.status(401).json({
      success: false,
      error: 'SESSION_EXPIRED',
      message: 'Session token is invalid or has expired.'
    });
  }

  res.status(200).json({
    success: true,
    user
  });
});

// POST /api/auth/logout - End active session
router.post('/logout', (req, res) => {
  const authHeader = req.headers.authorization;
  const token = authHeader && authHeader.startsWith('Bearer ')
    ? authHeader.slice(7)
    : req.body.token;

  if (token) {
    authService.revokeToken(token);
  }

  res.status(200).json({
    success: true,
    message: 'Logged out successfully.'
  });
});

// GET /api/auth/users - Public sanitized list of registered user emails for quick testing
router.get('/users', (req, res) => {
  const users = authService.getAllUsers().map(u => ({
    id: u.id,
    name: u.name,
    email: u.email,
    createdAt: u.createdAt
  }));
  res.status(200).json({
    success: true,
    count: users.length,
    users
  });
});

module.exports = router;
