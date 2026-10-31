// Database-backed authentication. Replaces the old users.json + in-memory sessions.
// Session tokens are random; only their SHA-256 is stored, with a fixed expiry.
const fs = require('fs');
const { randomUUID } = require('crypto');
const db = require('../db/pool');
const { hashPassword, verifyPassword, randomToken, sha256, PBKDF2_ITERATIONS, LEGACY_ITERATIONS } = require('../lib/security');
const { audit } = require('../lib/audit');

const SESSION_TTL_DAYS = Number(process.env.SESSION_TTL_DAYS || 7);
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MIN_PASSWORD = 8;

function authError(code, message) {
  return Object.assign(new Error(message), { code });
}

function validateCredentials(email, password, isRegistering = false) {
  if (!email || typeof email !== 'string') throw authError('VALIDATION', 'Email address is required.');
  const cleanEmail = email.trim().toLowerCase();
  if (!EMAIL_REGEX.test(cleanEmail) || cleanEmail.length > 254) throw authError('VALIDATION', 'Please enter a valid email address.');
  if (!password || typeof password !== 'string') throw authError('VALIDATION', 'Password is required.');
  if (password.length > 200) throw authError('VALIDATION', 'Password is too long.');
  if (isRegistering && password.length < MIN_PASSWORD) {
    throw authError('VALIDATION', `Password must be at least ${MIN_PASSWORD} characters long.`);
  }
  return cleanEmail;
}

function publicUser(row) {
  return { id: row.id, name: row.name, email: row.email, createdAt: row.created_at };
}

async function createSession(userId, meta = {}) {
  const token = `los_${randomToken(32)}`;
  const expiresAt = new Date(Date.now() + SESSION_TTL_DAYS * 86400000);
  await db.query(
    'INSERT INTO sessions (id, user_id, token_hash, expires_at, user_agent, ip) VALUES ($1,$2,$3,$4,$5,$6)',
    [randomUUID(), userId, sha256(token), expiresAt, (meta.userAgent || '').slice(0, 300) || null, meta.ip || null]
  );
  return { token, expiresAt };
}

async function registerUser({ email, password, name }, meta = {}) {
  const cleanEmail = validateCredentials(email, password, true);
  const cleanName = typeof name === 'string' && name.trim() ? name.trim().slice(0, 120) : cleanEmail.split('@')[0];
  const { hash, salt, iterations } = await hashPassword(password);
  const id = randomUUID();
  try {
    await db.withTransaction(async (c) => {
      await c.query(
        `INSERT INTO users (id, email, name, password_hash, password_salt, password_iters)
         VALUES ($1,$2,$3,$4,$5,$6)`,
        [id, cleanEmail, cleanName, hash, salt, iterations]
      );
      await c.query('INSERT INTO subscriptions (user_id) VALUES ($1)', [id]);
      await audit({ actorId: id, action: 'user.register', entityType: 'user', entityId: id, ip: meta.ip }, c);
    });
  } catch (err) {
    if (err.code === '23505') throw authError('EMAIL_EXISTS', 'An account with this email already exists. Please sign in instead.');
    throw err;
  }
  const session = await createSession(id, meta);
  const { rows } = await db.query('SELECT * FROM users WHERE id = $1', [id]);
  return { user: publicUser(rows[0]), token: session.token, expiresAt: session.expiresAt };
}

async function loginUser({ email, password }, meta = {}) {
  const cleanEmail = validateCredentials(email, password, false);
  const { rows } = await db.query('SELECT * FROM users WHERE email = $1 AND deleted_at IS NULL', [cleanEmail]);
  const user = rows[0];
  // Same message for unknown email and wrong password, so accounts can't be enumerated.
  const invalid = authError('INVALID_CREDENTIALS', 'Incorrect email or password.');
  if (!user) {
    await hashPassword(password); // equalise timing with the found-user path
    throw invalid;
  }
  const ok = await verifyPassword(password, user.password_salt, user.password_hash, user.password_iters);
  if (!ok) {
    await audit({ actorId: user.id, action: 'user.login_failed', entityType: 'user', entityId: user.id, ip: meta.ip });
    throw invalid;
  }
  if (user.password_iters < PBKDF2_ITERATIONS) {
    const upgraded = await hashPassword(password);
    await db.query('UPDATE users SET password_hash=$1, password_salt=$2, password_iters=$3, updated_at=now() WHERE id=$4',
      [upgraded.hash, upgraded.salt, upgraded.iterations, user.id]);
  }
  const session = await createSession(user.id, meta);
  await audit({ actorId: user.id, action: 'user.login', entityType: 'user', entityId: user.id, ip: meta.ip });
  return { user: publicUser(user), token: session.token, expiresAt: session.expiresAt };
}

/** Returns the user for a valid, unexpired, unrevoked session token, else null. */
async function verifyToken(token) {
  if (!token || typeof token !== 'string' || token.length > 200) return null;
  const { rows } = await db.query(
    `SELECT u.* FROM sessions s JOIN users u ON u.id = s.user_id
     WHERE s.token_hash = $1 AND s.revoked_at IS NULL AND s.expires_at > now() AND u.deleted_at IS NULL`,
    [sha256(token)]
  );
  return rows[0] ? publicUser(rows[0]) : null;
}

async function revokeToken(token) {
  if (!token) return false;
  const r = await db.query('UPDATE sessions SET revoked_at = now() WHERE token_hash = $1 AND revoked_at IS NULL', [sha256(token)]);
  return r.rowCount > 0;
}

async function revokeAllSessions(userId) {
  await db.query('UPDATE sessions SET revoked_at = now() WHERE user_id = $1 AND revoked_at IS NULL', [userId]);
}

async function changePassword(userId, currentPassword, newPassword) {
  const { rows } = await db.query('SELECT * FROM users WHERE id = $1', [userId]);
  if (!rows[0]) throw authError('NOT_FOUND', 'User not found.');
  const ok = await verifyPassword(currentPassword || '', rows[0].password_salt, rows[0].password_hash, rows[0].password_iters);
  if (!ok) throw authError('INVALID_CREDENTIALS', 'Current password is incorrect.');
  validateCredentials(rows[0].email, newPassword, true);
  const h = await hashPassword(newPassword);
  await db.query('UPDATE users SET password_hash=$1, password_salt=$2, password_iters=$3, updated_at=now() WHERE id=$4', [h.hash, h.salt, h.iterations, userId]);
  await revokeAllSessions(userId);
  await audit({ actorId: userId, action: 'user.password_changed', entityType: 'user', entityId: userId });
}

/**
 * Imports users from the legacy backend/data/users.json, keeping their existing
 * PBKDF2 hashes (10k iterations); hashes are upgraded on next login.
 * Idempotent: users already imported (by legacy id or email) are skipped.
 */
async function importLegacyUsers(filePath) {
  if (!fs.existsSync(filePath)) return { imported: 0, skipped: 0, missing: true };
  const users = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
  let imported = 0;
  let skipped = 0;
  for (const u of users) {
    if (!u.email || !u.passwordHash || !u.salt) { skipped++; continue; }
    const email = String(u.email).trim().toLowerCase();
    const r = await db.query(
      `INSERT INTO users (id, email, name, password_hash, password_salt, password_iters, legacy_id, created_at)
       SELECT $1,$2,$3,$4,$5,$6,$7,$8
       WHERE NOT EXISTS (SELECT 1 FROM users WHERE email = $2 OR legacy_id = $7)`,
      [randomUUID(), email, u.name || email.split('@')[0], u.passwordHash, u.salt, LEGACY_ITERATIONS, u.id, u.createdAt || new Date().toISOString()]
    );
    if (r.rowCount) {
      imported++;
      await db.query('INSERT INTO subscriptions (user_id) SELECT id FROM users WHERE email = $1 ON CONFLICT DO NOTHING', [email]);
    } else skipped++;
  }
  return { imported, skipped };
}

module.exports = {
  registerUser, loginUser, verifyToken, revokeToken, revokeAllSessions, changePassword,
  validateCredentials, importLegacyUsers, SESSION_TTL_DAYS,
};
