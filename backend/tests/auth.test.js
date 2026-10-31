// Auth against the real database (embedded PostgreSQL or TEST_DATABASE_URL).
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const crypto = require('crypto');
const { start, stop, call, newUser } = require('./helpers/api');
const authService = require('../services/authService');

test.before(start);
test.after(stop);

test('validateCredentials: format and length rules', () => {
  assert.throws(() => authService.validateCredentials('', 'password123'), /Email address is required/);
  assert.throws(() => authService.validateCredentials('not-an-email', 'password123'), /valid email/);
  assert.throws(() => authService.validateCredentials('a@b.co', ''), /Password is required/);
  assert.throws(() => authService.validateCredentials('a@b.co', 'short', true), /at least 8/);
  assert.equal(authService.validateCredentials(' TEST@GMAIL.COM ', 'whatever1', false), 'test@gmail.com');
});

test('register → me → logout invalidates the session', async () => {
  const u = await newUser('auth');
  const me = await call('GET', '/api/auth/me', { token: u.token });
  assert.equal(me.status, 200);
  assert.equal(me.body.user.email, u.email);
  assert.equal(me.body.user.passwordHash, undefined);
  await call('POST', '/api/auth/logout', { token: u.token });
  assert.equal((await call('GET', '/api/auth/me', { token: u.token })).status, 401);
});

test('duplicate email is rejected with 409', async () => {
  const u = await newUser('dup');
  const r = await call('POST', '/api/auth/register', { body: { email: u.email.toUpperCase(), password: 'another-pass-1' } });
  assert.equal(r.status, 409);
});

test('login: same error for unknown email and wrong password', async () => {
  const u = await newUser('login');
  const wrong = await call('POST', '/api/auth/login', { body: { email: u.email, password: 'wrong-password' } });
  const unknown = await call('POST', '/api/auth/login', { body: { email: `nobody-${u.email}`, password: 'wrong-password' } });
  assert.equal(wrong.status, 401);
  assert.equal(unknown.status, 401);
  assert.equal(wrong.body.message, unknown.body.message);
  const ok = await call('POST', '/api/auth/login', { body: { email: u.email, password: 'correct-horse-9' } });
  assert.equal(ok.status, 200);
  assert.match(ok.headers.get('set-cookie'), /los_session=.*HttpOnly/i);
});

test('cookie sessions require the CSRF header on writes', async () => {
  const u = await newUser('csrf');
  const login = await call('POST', '/api/auth/login', { body: { email: u.email, password: 'correct-horse-9' } });
  const cookie = login.headers.get('set-cookie').split(';')[0];
  const noHeader = await call('POST', '/api/families', { headers: { Cookie: cookie }, body: { name: 'X' } });
  assert.equal(noHeader.status, 403);
  const withHeader = await call('POST', '/api/families', { headers: { Cookie: cookie, 'X-LOS-CSRF': '1' }, body: { name: 'X' } });
  assert.equal(withHeader.status, 201);
  const read = await call('GET', '/api/families', { headers: { Cookie: cookie } });
  assert.equal(read.status, 200);
});

test('legacy users.json import keeps passwords working and upgrades the hash', async () => {
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto.pbkdf2Sync('legacy-pass', salt, 10000, 64, 'sha512').toString('hex');
  const email = `legacy-${crypto.randomUUID().slice(0, 8)}@example.test`;
  const file = path.join(os.tmpdir(), `users-${Date.now()}.json`);
  fs.writeFileSync(file, JSON.stringify([{ id: `usr_${Date.now()}`, name: 'Legacy', email, salt, passwordHash: hash, createdAt: new Date().toISOString() }]));
  const first = await authService.importLegacyUsers(file);
  const again = await authService.importLegacyUsers(file);
  fs.unlinkSync(file);
  assert.equal(first.imported, 1);
  assert.equal(again.imported, 0);
  const ok = await call('POST', '/api/auth/login', { body: { email, password: 'legacy-pass' } });
  assert.equal(ok.status, 200);
  const db = require('../db/pool');
  const { rows } = await db.query('SELECT password_iters FROM users WHERE email = $1', [email]);
  assert.ok(rows[0].password_iters >= 210000);
});

test('protected routes reject anonymous requests', async () => {
  for (const p of ['/api/families', '/api/me', '/api/market/status', '/api/concall/history']) {
    assert.equal((await call('GET', p)).status, 401, p);
  }
  assert.equal((await call('GET', '/api/auth/users')).status, 404); // public user list removed
});
