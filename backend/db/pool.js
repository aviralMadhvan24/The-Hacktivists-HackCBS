const { Pool, types } = require('pg');

// Return NUMERIC as JS numbers. Amounts here stay well inside double precision
// (< 1e13 rupees); the engine rounds outputs to paise.
types.setTypeParser(1700, (v) => (v === null ? null : parseFloat(v)));
// Keep DATE as 'YYYY-MM-DD' strings to avoid timezone shifts.
types.setTypeParser(1082, (v) => v);

let pool = null;

function buildConfig() {
  const url = process.env.DATABASE_URL;
  if (!url) return null;
  // Keep the pool small on YugabyteDB Aeon Sandbox (max_connections is ~13 per node).
  const config = {
    connectionString: url,
    max: Number(process.env.DB_POOL_MAX || 10),
    idleTimeoutMillis: Number(process.env.DB_IDLE_TIMEOUT_MS || 10000),
    connectionTimeoutMillis: Number(process.env.DB_CONNECT_TIMEOUT_MS || 10000),
  };
  // YugabyteDB Aeon requires TLS. DB_SSL=require verifies the server cert,
  // optionally against DB_SSL_ROOT_CERT (path to the cluster's root.crt).
  const sslMode = (process.env.DB_SSL || '').toLowerCase();
  if (sslMode === 'require' || sslMode === 'verify-full') {
    const fs = require('fs');
    config.ssl = { rejectUnauthorized: true };
    if (process.env.DB_SSL_ROOT_CERT) {
      config.ssl.ca = fs.readFileSync(process.env.DB_SSL_ROOT_CERT, 'utf-8');
    }
  }
  return config;
}

function isConfigured() {
  return Boolean(process.env.DATABASE_URL);
}

function getPool() {
  if (!pool) {
    const config = buildConfig();
    if (!config) {
      const err = new Error('DATABASE_URL is not configured.');
      err.code = 'DB_NOT_CONFIGURED';
      throw err;
    }
    pool = new Pool(config);
    pool.on('error', (err) => console.error('Postgres pool error:', err.message));
  }
  return pool;
}

async function query(text, params) {
  return getPool().query(text, params);
}

// YugabyteDB can raise serialization / restart errors (40001) under contention;
// retry the whole transaction a few times as Yugabyte recommends.
async function withTransaction(fn, { retries = 3 } = {}) {
  for (let attempt = 0; ; attempt++) {
    const client = await getPool().connect();
    try {
      await client.query('BEGIN');
      const result = await fn(client);
      await client.query('COMMIT');
      return result;
    } catch (err) {
      try { await client.query('ROLLBACK'); } catch (_) { /* ignore */ }
      if (err.code === '40001' && attempt < retries) continue;
      throw err;
    } finally {
      client.release();
    }
  }
}

async function close() {
  if (pool) {
    const p = pool;
    pool = null;
    await p.end();
  }
}

module.exports = { query, withTransaction, getPool, isConfigured, close };
