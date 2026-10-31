// node --test global setup: boots one real PostgreSQL 15 server (binaries from
// embedded-postgres) for the whole run, unless TEST_DATABASE_URL points at an
// existing database such as a YugabyteDB cluster. Child test processes inherit env.
//
// The server is started through pg_ctl rather than embedded-postgres' start():
// on Windows, postgres refuses to run under an administrator account, and
// pg_ctl drops to a restricted token automatically.
const fs = require('fs');
const os = require('os');
const path = require('path');
const net = require('net');
const { spawn } = require('child_process');

// stdio must be 'ignore': the server pg_ctl launches inherits any pipes, and
// on Windows the call would then never complete.
function run(cmd, args) {
  return new Promise((resolve, reject) => {
    const child = spawn(cmd, args, { stdio: 'ignore', windowsHide: true });
    child.on('error', reject);
    child.on('exit', (code) => (code === 0 ? resolve() : reject(new Error(`${path.basename(cmd)} exited with ${code}`))));
  });
}
let dataDir = null;
let pgCtl = null;

function freePort() {
  return new Promise((resolve, reject) => {
    const srv = net.createServer();
    srv.listen(0, '127.0.0.1', () => {
      const { port } = srv.address();
      srv.close(() => resolve(port));
    });
    srv.on('error', reject);
  });
}

function binDir() {
  const platform = process.platform === 'win32' ? 'windows' : process.platform;
  return path.join(__dirname, '..', '..', 'node_modules', '@embedded-postgres',
    `${platform}-${process.arch}`, 'native', 'bin');
}

async function globalSetup() {
  process.env.NODE_ENV = 'test';
  process.env.APP_ENCRYPTION_KEY = process.env.APP_ENCRYPTION_KEY || 'a'.repeat(64); // test-only key

  if (process.env.TEST_DATABASE_URL) {
    process.env.DATABASE_URL = process.env.TEST_DATABASE_URL;
  } else {
    const EmbeddedPostgres = require('embedded-postgres').default;
    const port = await freePort();
    dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'liquidityos-pg-'));
    const password = 'los_test_pw';
    const pg = new EmbeddedPostgres({ databaseDir: dataDir, user: 'los', password, port, persistent: false, onLog: () => {} });
    await pg.initialise(); // initdb only

    pgCtl = path.join(binDir(), process.platform === 'win32' ? 'pg_ctl.exe' : 'pg_ctl');
    await run(pgCtl, ['start', '-w', '-t', '60', '-D', dataDir, '-l', path.join(dataDir, 'server.log'),
      '-o', `-p ${port} -c listen_addresses=127.0.0.1`]);

    const { Client } = require('pg');
    const admin = new Client({ host: '127.0.0.1', port, user: 'los', password, database: 'postgres' });
    await admin.connect();
    await admin.query('CREATE DATABASE liquidityos_test');
    await admin.end();
    process.env.DATABASE_URL = `postgres://los:${password}@127.0.0.1:${port}/liquidityos_test`;
  }

  const { migrate } = require('../../db/migrate');
  const db = require('../../db/pool');
  await migrate({ log: () => {} });
  await db.close();
}

async function globalTeardown() {
  if (pgCtl && dataDir) {
    try { await run(pgCtl, ['stop', '-m', 'fast', '-w', '-D', dataDir]); } catch (_) { /* already stopped */ }
    try { fs.rmSync(dataDir, { recursive: true, force: true }); } catch (_) { /* ignore */ }
  }
}

module.exports = { globalSetup, globalTeardown };
