// Imports accounts from the old file-based store (backend/data/users.json) into
// the database, keeping existing passwords. Safe to run more than once.
// Usage: npm run db:import-legacy [-- path/to/users.json]
require('dotenv').config();
const path = require('path');
const db = require('../db/pool');
const { migrate } = require('../db/migrate');
const { importLegacyUsers } = require('../services/authService');

(async () => {
  const file = process.argv[2] || path.join(__dirname, '..', 'data', 'users.json');
  await migrate();
  const r = await importLegacyUsers(file);
  if (r.missing) console.log(`No legacy file at ${file}; nothing to import.`);
  else console.log(`Imported ${r.imported} user(s); skipped ${r.skipped} (already present or incomplete).`);
  console.log('The legacy file was not modified. Delete it once you have confirmed the import.');
  await db.close();
})().catch(async (err) => { console.error('Import failed:', err.message); await db.close(); process.exit(1); });
