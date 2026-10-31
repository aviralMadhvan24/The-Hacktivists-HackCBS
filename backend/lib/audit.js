// Append-only audit log of security- and finance-relevant actions.
const { randomUUID } = require('crypto');
const db = require('../db/pool');

/**
 * @param {object} entry { familyId, actorId, action, entityType, entityId, details, ip }
 * @param {import('pg').PoolClient} [client] use inside an existing transaction
 */
async function audit(entry, client) {
  const q = client || db;
  await q.query(
    `INSERT INTO audit_log (id, family_id, actor_id, action, entity_type, entity_id, details, ip)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
    [randomUUID(), entry.familyId || null, entry.actorId || null, entry.action, entry.entityType || null,
      entry.entityId ? String(entry.entityId) : null, entry.details ? JSON.stringify(entry.details) : null, entry.ip || null]
  );
}

module.exports = { audit };
