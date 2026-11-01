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
    // Keep connections around: on networks whose public IP changes per connection,
    // fewer new connections means fewer chances of leaving from an IP the
    // database's allow list doesn't include.
    idleTimeoutMillis: Number(process.env.DB_IDLE_TIMEOUT_MS || 120000),
    connectionTimeoutMillis: Number(process.env.DB_CONNECT_TIMEOUT_MS || 6000),
    keepAlive: true,
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

// Only the connect step is retried, so a statement never runs twice.
const CONNECT_ATTEMPTS = () => Math.max(1, Number(process.env.DB_CONNECT_ATTEMPTS || 3));
const isConnectFailure = (err) => /connection timeout|timeout exceeded when trying to connect|Connection terminated unexpectedly|ECONNRESET|ETIMEDOUT|ECONNREFUSED|EHOSTUNREACH/i.test(`${err.message} ${err.code || ''}`);

async function connect() {
  for (let attempt = 1; ; attempt++) {
    try {
      const client = await getPool().connect();
      // A connection that drops while checked out emits 'error' on the client.
      // Without a listener Node treats it as unhandled and kills the server
      // (seen with Aeon on networks that change IP). The query then fails normally.
      if (!client.__finsightErrorHandler) {
        client.on('error', (err) => console.error('Postgres connection error:', err.message));
        client.__finsightErrorHandler = true;
      }
      return client;
    } catch (err) {
      if (attempt >= CONNECT_ATTEMPTS() || !isConnectFailure(err)) throw err;
    }
  }
}

async function query(text, params) {
  const client = await connect();
  try {
    return await client.query(text, params);
  } finally {
    client.release();
  }
}

// YugabyteDB can raise serialization / restart errors (40001) under contention;
// retry the whole transaction a few times as Yugabyte recommends.
async function withTransaction(fn, { retries = 3 } = {}) {
  for (let attempt = 0; ; attempt++) {
    const client = await connect();
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
