// Password hashing, opaque tokens and symmetric encryption for secrets at rest.
const crypto = require('crypto');

// OWASP (2023) guidance for PBKDF2-HMAC-SHA512.
const PBKDF2_ITERATIONS = 210000;
const LEGACY_ITERATIONS = 10000; // used by the old file-based auth

function hashPassword(password, salt = crypto.randomBytes(16).toString('hex'), iterations = PBKDF2_ITERATIONS) {
  return new Promise((resolve, reject) => {
    crypto.pbkdf2(password, salt, iterations, 64, 'sha512', (err, key) => {
      if (err) reject(err);
      else resolve({ hash: key.toString('hex'), salt, iterations });
    });
  });
}

async function verifyPassword(password, salt, storedHash, iterations) {
  const { hash } = await hashPassword(password, salt, iterations);
  const a = Buffer.from(hash, 'hex');
  const b = Buffer.from(storedHash, 'hex');
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

/** Random URL-safe token; only its SHA-256 is stored server-side. */
function randomToken(bytes = 32) {
  return crypto.randomBytes(bytes).toString('base64url');
}

function sha256(value) {
  return crypto.createHash('sha256').update(value).digest('hex');
}

function encryptionKey() {
  const hex = process.env.APP_ENCRYPTION_KEY || '';
  if (!/^[0-9a-fA-F]{64}$/.test(hex)) {
    const err = new Error('APP_ENCRYPTION_KEY must be 64 hex characters (32 bytes). Generate one with: node -e "console.log(require(\'crypto\').randomBytes(32).toString(\'hex\'))"');
    err.code = 'ENCRYPTION_NOT_CONFIGURED';
    throw err;
  }
  return Buffer.from(hex, 'hex');
}

/** AES-256-GCM. Output: base64url(iv).base64url(tag).base64url(ciphertext) */
function encrypt(plaintext) {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', encryptionKey(), iv);
  const ct = Buffer.concat([cipher.update(String(plaintext), 'utf8'), cipher.final()]);
  return [iv, cipher.getAuthTag(), ct].map((b) => b.toString('base64url')).join('.');
}

function decrypt(payload) {
  const [iv, tag, ct] = String(payload).split('.').map((s) => Buffer.from(s, 'base64url'));
  const decipher = crypto.createDecipheriv('aes-256-gcm', encryptionKey(), iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(ct), decipher.final()]).toString('utf8');
}

module.exports = { hashPassword, verifyPassword, randomToken, sha256, encrypt, decrypt, PBKDF2_ITERATIONS, LEGACY_ITERATIONS };
