// Forward-only SQL migration runner. Each file in db/migrations runs once,
// inside a transaction, and is recorded with its checksum. A changed file that
// was already applied is an error, so history can't drift silently.
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const db = require('./pool');

const MIGRATIONS_DIR = path.join(__dirname, 'migrations');

function listMigrations() {
  return fs.readdirSync(MIGRATIONS_DIR)
    .filter((f) => /^\d{3}_.+\.sql$/.test(f))
    .sort()
    .map((file) => {
      const sql = fs.readFileSync(path.join(MIGRATIONS_DIR, file), 'utf-8');
      const checksum = crypto.createHash('sha256').update(sql).digest('hex');
      return { file, sql, checksum };
    });
}

async function migrate({ log = console.log } = {}) {
  const enc = await db.query('SHOW server_encoding');
  if (enc.rows[0].server_encoding !== 'UTF8') {
    throw new Error(`Database encoding is ${enc.rows[0].server_encoding}; FinSight needs UTF8 (e.g. for ₹). Recreate the database with ENCODING 'UTF8'.`);
  }
  await db.query(`CREATE TABLE IF NOT EXISTS schema_migrations (
    file TEXT PRIMARY KEY,
    checksum TEXT NOT NULL,
    applied_at TIMESTAMPTZ NOT NULL DEFAULT now()
  )`);
  const { rows } = await db.query('SELECT file, checksum FROM schema_migrations');
  const applied = new Map(rows.map((r) => [r.file, r.checksum]));
  const ran = [];

  for (const m of listMigrations()) {
    if (applied.has(m.file)) {
      if (applied.get(m.file) !== m.checksum) {
        throw new Error(`Migration ${m.file} was modified after it was applied. Add a new migration instead.`);
      }
      continue;
    }
    await db.withTransaction(async (client) => {
      await client.query(m.sql);
      // ON CONFLICT guards against two instances migrating at once.
      const res = await client.query(
        'INSERT INTO schema_migrations (file, checksum) VALUES ($1, $2) ON CONFLICT (file) DO NOTHING',
        [m.file, m.checksum]
      );
      if (res.rowCount === 0) throw new Error(`Migration ${m.file} applied concurrently by another process.`);
    }, { retries: 0 });
    log(`Applied migration ${m.file}`);
    ran.push(m.file);
  }
  return ran;
}

if (require.main === module) {
  require('dotenv').config();
  migrate()
    .then((ran) => { console.log(ran.length ? `Done (${ran.length} applied).` : 'Database is up to date.'); return db.close(); })
    .catch(async (err) => { console.error('Migration failed:', err.message); await db.close(); process.exit(1); });
}

module.exports = { migrate, listMigrations };
