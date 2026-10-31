// Runs the backend tests against a separate "liquidityos_test" database on the
// cluster in DATABASE_URL (e.g. YugabyteDB Aeon), one file at a time with a tiny
// connection pool, so a small cluster's connection limit isn't exceeded.
require('dotenv').config();
const { spawnSync } = require('child_process');

const url = new URL(process.env.DATABASE_URL || '');
if (!url.hostname) { console.error('DATABASE_URL is not set.'); process.exit(1); }
url.pathname = `/${process.env.TEST_DB_NAME || 'liquidityos_test'}`;
const env = { ...process.env, TEST_DATABASE_URL: url.toString(), DB_POOL_MAX: '2' };
const files = require('fs').readdirSync('tests').filter((f) => f.endsWith('.test.js')).map((f) => `tests/${f}`);
const r = spawnSync(process.execPath, ['--test', '--test-global-setup=tests/helpers/globalSetup.js', '--test-concurrency=1', ...files], { stdio: 'inherit', env });
process.exit(r.status ?? 1);
