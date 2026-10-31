require('dotenv').config();
const fs = require('fs');
const path = require('path');
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const cookieParser = require('cookie-parser');
const rateLimit = require('express-rate-limit');

const db = require('./db/pool');
const { requireAuth } = require('./middleware/auth');
const { errorMiddleware } = require('./lib/http');
const { status: integrationStatus } = require('./services/integrationStatus');

const app = express();
const PORT = process.env.PORT || 3000;
const isTest = process.env.NODE_ENV === 'test';

if (process.env.TRUST_PROXY) app.set('trust proxy', process.env.TRUST_PROXY === 'true' ? 1 : process.env.TRUST_PROXY);
app.disable('x-powered-by');
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'", 'https://fonts.googleapis.com'],
      fontSrc: ["'self'", 'https://fonts.gstatic.com'],
      imgSrc: ["'self'", 'data:'],
      connectSrc: ["'self'"],
      frameAncestors: ["'none'"],
    },
  },
}));

// CORS: same-origin by default. Extra origins (e.g. the Vite dev server) via CORS_ORIGINS.
const allowedOrigins = (process.env.CORS_ORIGINS || '').split(',').map((s) => s.trim()).filter(Boolean);
app.use(cors({
  origin: (origin, cb) => cb(null, !origin || allowedOrigins.includes(origin)),
  credentials: true,
  allowedHeaders: ['Content-Type', 'Authorization', 'X-LOS-CSRF'],
}));
app.use(cookieParser());
app.use(express.json({ limit: '2mb' }));

const limiter = (windowMin, max) => rateLimit({
  windowMs: windowMin * 60000, limit: max, standardHeaders: 'draft-7', legacyHeaders: false,
  skip: () => isTest,
  message: { success: false, error: 'RATE_LIMITED', message: 'Too many requests. Please slow down and try again shortly.' },
});
app.use('/api/', limiter(1, 300));
app.use('/api/auth/login', limiter(15, 20));
app.use('/api/auth/register', limiter(60, 10));

// ---- Health -------------------------------------------------------------------
app.get('/api/health', async (req, res) => {
  let database = { configured: db.isConfigured(), reachable: false };
  if (database.configured) {
    try {
      const { rows } = await db.query('SELECT version() AS v');
      database = { configured: true, reachable: true, engine: /YB/.test(rows[0].v) ? 'YugabyteDB' : 'PostgreSQL' };
    } catch (err) {
      database.error = err.code || 'UNREACHABLE';
    }
  }
  const integrations = integrationStatus();
  res.status(database.reachable ? 200 : 503).json({
    status: database.reachable ? 'healthy' : 'degraded',
    service: 'FinSight API',
    version: '2.0.0',
    database,
    integrations,
    // Kept for the iOS client.
    llmConfigured: integrations.llm.configured,
    activeProvider: integrations.llm.provider || 'None',
    uptimeSeconds: Math.floor(process.uptime()),
    timestamp: new Date().toISOString(),
  });
});

// ---- Routes -------------------------------------------------------------------
app.use('/api/auth', require('./routes/auth'));
app.use('/api/zerodha', require('./routes/zerodha')); // applies auth per route (OAuth callback is public)
app.use('/api/me', requireAuth, require('./routes/me'));
app.use('/api/families', requireAuth, require('./routes/families'));
app.use('/api/market', requireAuth, require('./routes/market'));
app.use('/api/concall', requireAuth, require('./routes/concall'));
app.use('/api/recovery', requireAuth, require('./routes/recovery'));
app.use('/api', (req, res) => res.status(404).json({ success: false, error: 'NOT_FOUND', message: 'Unknown API route.' }));

// ---- Web app (production build) -----------------------------------------------
const webDist = path.resolve(process.env.WEB_DIST || path.join(__dirname, '..', 'apps', 'web', 'dist'));
if (fs.existsSync(path.join(webDist, 'index.html'))) {
  app.use(express.static(webDist, { index: false, maxAge: '1h' }));
  app.get(/^\/(?!api\/).*/, (req, res) => res.sendFile(path.join(webDist, 'index.html')));
} else {
  app.get('/', (req, res) => res.send('FinSight API is running. Build the web app (apps/web) to serve the UI here. Health: /api/health'));
}

app.use(errorMiddleware);

async function start() {
  if (db.isConfigured() && process.env.MIGRATE_ON_START !== 'false') {
    const { migrate } = require('./db/migrate');
    await migrate();
  } else if (!db.isConfigured()) {
    console.warn('DATABASE_URL is not set: the API will start, but data routes return 503.');
  }
  app.listen(PORT, '0.0.0.0', () => console.log(`FinSight API listening on http://localhost:${PORT}`));
}

if (require.main === module) {
  start().catch((err) => { console.error('Startup failed:', err.message); process.exit(1); });
}

module.exports = app;
