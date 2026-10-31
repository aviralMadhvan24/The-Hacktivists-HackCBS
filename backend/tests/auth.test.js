const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const {
  registerUser,
  loginUser,
  verifyToken,
  revokeToken,
  getAllUsers,
  validateCredentials
} = require('../services/authService');

test('Auth Service: Seeds default demo and admin accounts in database', () => {
  const users = getAllUsers();
  assert.ok(users.length >= 2);
  const demo = users.find(u => u.email === 'user@gmail.com');
  const admin = users.find(u => u.email === 'admin@gmail.com');
  assert.ok(demo, 'Default demo user should exist in database');
  assert.ok(admin, 'Default admin user should exist in database');
});

test('Auth Service: Validates credentials format accurately', () => {
  // Invalid emails
  assert.throws(() => validateCredentials('', 'password123'), /Email address is required/);
  assert.throws(() => validateCredentials('not-an-email', 'password123'), /Please enter a valid email address/);
  assert.throws(() => validateCredentials('user@', 'password123'), /Please enter a valid email address/);
  
  // Weak passwords
  assert.throws(() => validateCredentials('test@gmail.com', ''), /Password is required/);
  assert.throws(() => validateCredentials('test@gmail.com', '12345'), /at least 6 characters long/);

  // Valid credentials
  const clean = validateCredentials(' TEST@GMAIL.COM ', 'securePass123');
  assert.equal(clean, 'test@gmail.com');
});

test('Auth Service: Successfully logs in default demo user', () => {
  const result = loginUser({ email: 'user@gmail.com', password: 'password123' });
  assert.ok(result.token, 'Should return a session token');
  assert.equal(result.user.email, 'user@gmail.com');
  assert.equal(result.user.passwordHash, undefined, 'Must not expose passwordHash');
  assert.equal(result.user.salt, undefined, 'Must not expose salt');
});

test('Auth Service: Rejects login with incorrect password', () => {
  assert.throws(
    () => loginUser({ email: 'user@gmail.com', password: 'wrongPassword' }),
    /Incorrect password/
  );
});

test('Auth Service: Rejects login with unregistered email', () => {
  assert.throws(
    () => loginUser({ email: 'unknown_ghost_user@gmail.com', password: 'password123' }),
    /No account found with this email/
  );
});

test('Auth Service: Successfully registers a new user in database and allows subsequent login', () => {
  const testEmail = `investor_${Date.now()}@gmail.com`;
  const registerResult = registerUser({
    name: 'Rohit Sharma',
    email: testEmail,
    password: 'myPortfolio2026'
  });

  assert.equal(registerResult.user.email, testEmail);
  assert.equal(registerResult.user.name, 'Rohit Sharma');
  assert.ok(registerResult.token);

  // Verify session token
  const verified = verifyToken(registerResult.token);
  assert.equal(verified.email, testEmail);

  // Now login with the newly created account
  const loginResult = loginUser({
    email: testEmail,
    password: 'myPortfolio2026'
  });
  assert.equal(loginResult.user.email, testEmail);
});

test('Auth Service: Rejects registration with duplicate email', () => {
  assert.throws(
    () => registerUser({ email: 'user@gmail.com', password: 'anotherPassword123' }),
    /already exists/
  );
});

test('Auth Service: Session token revocation works on logout', () => {
  const result = loginUser({ email: 'user@gmail.com', password: 'password123' });
  assert.ok(verifyToken(result.token));
  revokeToken(result.token);
  assert.equal(verifyToken(result.token), null);
});
