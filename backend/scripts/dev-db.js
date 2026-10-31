// Local development database: a persistent PostgreSQL 15 (from the
// embedded-postgres dev dependency) in backend/.devdb, for working before a
// YugabyteDB cluster is available. Production uses YugabyteDB.
//   node scripts/dev-db.js start   → prints the DATABASE_URL to put in .env
//   node scripts/dev-db.js stop
const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');

const DIR = path.join(__dirname, '..', '.devdb');
const PORT = Number(process.env.DEV_DB_PORT || 54320);
const USER = 'liquidityos';
const PASSWORD = 'liquidityos_dev';
const platform = process.platform === 'win32' ? 'windows' : process.platform;
const BIN = path.join(__dirname, '..', 'node_modules', '@embedded-postgres', `${platform}-${process.arch}`, 'native', 'bin');
const PG_CTL = path.join(BIN, process.platform === 'win32' ? 'pg_ctl.exe' : 'pg_ctl');

function run(cmd, args) {
  return new Promise((resolve, reject) => {
    const c = spawn(cmd, args, { stdio: 'ignore', windowsHide: true });
    c.on('error', reject);
    c.on('exit', (code) => (code === 0 ? resolve() : reject(new Error(`${path.basename(cmd)} exited with ${code}`))));
  });
}

async function start() {
  if (!fs.existsSync(path.join(DIR, 'PG_VERSION'))) {
    const EmbeddedPostgres = require('embedded-postgres').default;
    await new EmbeddedPostgres({ databaseDir: DIR, user: USER, password: PASSWORD, port: PORT, persistent: true, onLog: () => {} }).initialise();
  }
  try {
    await run(PG_CTL, ['start', '-w', '-t', '60', '-D', DIR, '-l', path.join(DIR, 'server.log'), '-o', `-p ${PORT} -c listen_addresses=127.0.0.1`]);
  } catch (err) {
    console.log('pg_ctl start returned an error (the server may already be running).');
  }
  const { Client } = require('pg');
  const c = new Client({ host: '127.0.0.1', port: PORT, user: USER, password: PASSWORD, database: 'postgres' });
  await c.connect();
  const { rowCount } = await c.query("SELECT 1 FROM pg_database WHERE datname = 'liquidityos'");
  if (!rowCount) await c.query("CREATE DATABASE liquidityos ENCODING 'UTF8' TEMPLATE template0 LC_COLLATE 'C' LC_CTYPE 'C'");
  await c.end();
  console.log(`Dev database running.\nDATABASE_URL=postgres://${USER}:${PASSWORD}@127.0.0.1:${PORT}/liquidityos`);
}

async function stop() {
  await run(PG_CTL, ['stop', '-m', 'fast', '-w', '-D', DIR]);
  console.log('Dev database stopped.');
}

const cmd = process.argv[2];
(cmd === 'stop' ? stop() : start()).catch((err) => { console.error(err.message); process.exit(1); });
