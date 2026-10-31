const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const DATA_DIR = path.join(__dirname, '..', 'data');
const USERS_FILE = path.join(DATA_DIR, 'users.json');

// In-memory token store for active sessions
const activeSessions = new Map();

// Helper to hash password with PBKDF2 (SHA-512) and salt
function hashPassword(password, salt) {
  if (!salt) {
    salt = crypto.randomBytes(16).toString('hex');
  }
  const hash = crypto.pbkdf2Sync(password, salt, 10000, 64, 'sha512').toString('hex');
  return { hash, salt };
}

// Verify password against stored hash and salt
function verifyPassword(password, salt, storedHash) {
  const { hash } = hashPassword(password, salt);
  return crypto.timingSafeEqual(Buffer.from(hash, 'hex'), Buffer.from(storedHash, 'hex'));
}

// RFC-compliant email regex
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function validateCredentials(email, password, isRegistering = false) {
  if (!email || typeof email !== 'string') {
    throw new Error('Email address is required.');
  }
  const cleanEmail = email.trim().toLowerCase();
  if (!EMAIL_REGEX.test(cleanEmail)) {
    throw new Error('Please enter a valid email address (e.g. user@gmail.com).');
  }
  if (!password || typeof password !== 'string') {
    throw new Error('Password is required.');
  }
  if (password.length < 6) {
    throw new Error('Password must be at least 6 characters long.');
  }
  return cleanEmail;
}

// Ensure database file exists and pre-seed with demo users if empty
function ensureDatabase() {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
  if (!fs.existsSync(USERS_FILE)) {
    const demoSalt = crypto.randomBytes(16).toString('hex');
    const demoHash = hashPassword('password123', demoSalt).hash;

    const adminSalt = crypto.randomBytes(16).toString('hex');
    const adminHash = hashPassword('admin123', adminSalt).hash;

    const initialUsers = [
      {
        id: 'usr_demo_1',
        name: 'Demo Investor',
        email: 'user@gmail.com',
        salt: demoSalt,
        passwordHash: demoHash,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      },
      {
        id: 'usr_admin_1',
        name: 'System Admin',
        email: 'admin@gmail.com',
        salt: adminSalt,
        passwordHash: adminHash,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      }
    ];

    fs.writeFileSync(USERS_FILE, JSON.stringify(initialUsers, null, 2), 'utf-8');
  }
}

function getAllUsers() {
  ensureDatabase();
  try {
    const raw = fs.readFileSync(USERS_FILE, 'utf-8');
    return JSON.parse(raw);
  } catch (err) {
    console.error('Error reading users database:', err);
    return [];
  }
}

function saveAllUsers(users) {
  ensureDatabase();
  fs.writeFileSync(USERS_FILE, JSON.stringify(users, null, 2), 'utf-8');
}

function sanitizeUser(user) {
  const { passwordHash, salt, ...safeUser } = user;
  return safeUser;
}

// Register a new user account in database
function registerUser({ email, password, name }) {
  const cleanEmail = validateCredentials(email, password, true);
  const cleanName = (name && typeof name === 'string' && name.trim().length > 0)
    ? name.trim()
    : cleanEmail.split('@')[0];

  const users = getAllUsers();
  const existing = users.find(u => u.email.toLowerCase() === cleanEmail);
  if (existing) {
    const err = new Error('An account with this email address already exists. Please sign in instead.');
    err.code = 'EMAIL_EXISTS';
    throw err;
  }

  const { hash, salt } = hashPassword(password);
  const newUser = {
    id: `usr_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`,
    name: cleanName,
    email: cleanEmail,
    salt,
    passwordHash: hash,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  };

  users.push(newUser);
  saveAllUsers(users);

  // Generate session token
  const token = `los_sess_${crypto.randomBytes(32).toString('hex')}`;
  activeSessions.set(token, {
    userId: newUser.id,
    email: newUser.email,
    createdAt: Date.now()
  });

  return {
    user: sanitizeUser(newUser),
    token
  };
}

// Authenticate user against database
function loginUser({ email, password }) {
  const cleanEmail = validateCredentials(email, password, false);
  const users = getAllUsers();
  const user = users.find(u => u.email.toLowerCase() === cleanEmail);

  if (!user) {
    const err = new Error('No account found with this email. Please check your email or create a new account.');
    err.code = 'USER_NOT_FOUND';
    throw err;
  }

  const isValid = verifyPassword(password, user.salt, user.passwordHash);
  if (!isValid) {
    const err = new Error('Incorrect password. Please verify and try again.');
    err.code = 'INVALID_PASSWORD';
    throw err;
  }

  const token = `los_sess_${crypto.randomBytes(32).toString('hex')}`;
  activeSessions.set(token, {
    userId: user.id,
    email: user.email,
    createdAt: Date.now()
  });

  return {
    user: sanitizeUser(user),
    token
  };
}

// Verify an active session token
function verifyToken(token) {
  if (!token || !activeSessions.has(token)) {
    return null;
  }
  const session = activeSessions.get(token);
  const users = getAllUsers();
  const user = users.find(u => u.id === session.userId);
  return user ? sanitizeUser(user) : null;
}

// Revoke a session token on logout
function revokeToken(token) {
  if (token && activeSessions.has(token)) {
    activeSessions.delete(token);
    return true;
  }
  return false;
}

module.exports = {
  registerUser,
  loginUser,
  verifyToken,
  revokeToken,
  getAllUsers,
  validateCredentials
};
