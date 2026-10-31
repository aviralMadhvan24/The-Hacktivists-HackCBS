// /api/me — profile, consents, entitlements, data export and account deletion.
const express = require('express');
const { randomUUID } = require('crypto');
const { z } = require('zod');
const db = require('../db/pool');
const { wrap, validate, badRequest, conflict, HttpError } = require('../lib/http');
const { verifyPassword } = require('../lib/security');
const { audit } = require('../lib/audit');
const { COOKIE_NAME } = require('../middleware/auth');
const entitlements = require('../services/entitlements');

const router = express.Router();

router.get('/', wrap(async (req, res) => {
  res.json({ success: true, user: req.user, entitlements: await entitlements.summary(req.user.id) });
}));

router.patch('/', wrap(async (req, res) => {
  const { name } = validate(z.object({ name: z.string().trim().min(1).max(120) }).strict(), req.body);
  await db.query('UPDATE users SET name = $2, updated_at = now() WHERE id = $1', [req.user.id, name]);
  res.json({ success: true, user: { ...req.user, name } });
}));

// ---- Consents --------------------------------------------------------------
const CONSENT_SCOPES = ['meko_context', 'broker_sync', 'ai_analysis'];

router.get('/consents', wrap(async (req, res) => {
  const { rows } = await db.query(
    'SELECT id, scope, family_id, granted_at, revoked_at FROM consents WHERE user_id = $1 ORDER BY granted_at DESC', [req.user.id]);
  const active = Object.fromEntries(CONSENT_SCOPES.map((s) => [s, rows.some((r) => r.scope === s && !r.revoked_at)]));
  res.json({ success: true, active, history: rows.map((r) => ({ id: r.id, scope: r.scope, familyId: r.family_id, grantedAt: r.granted_at, revokedAt: r.revoked_at })) });
}));

router.post('/consents', wrap(async (req, res) => {
  const { scope, granted } = validate(z.object({ scope: z.enum(CONSENT_SCOPES), granted: z.boolean() }).strict(), req.body);
  if (granted) {
    const { rowCount } = await db.query('SELECT 1 FROM consents WHERE user_id = $1 AND scope = $2 AND revoked_at IS NULL', [req.user.id, scope]);
    if (!rowCount) await db.query('INSERT INTO consents (id, user_id, scope) VALUES ($1,$2,$3)', [randomUUID(), req.user.id, scope]);
  } else {
    await db.query('UPDATE consents SET revoked_at = now() WHERE user_id = $1 AND scope = $2 AND revoked_at IS NULL', [req.user.id, scope]);
  }
  await audit({ actorId: req.user.id, action: granted ? 'consent.grant' : 'consent.revoke', entityType: 'consent', entityId: scope, ip: req.ip });
  res.json({ success: true, scope, granted });
}));

// ---- Data export (everything this user owns or created) ----------------------
router.get('/export', wrap(async (req, res) => {
  const id = req.user.id;
  const q = async (sql) => (await db.query(sql, [id])).rows;
  const data = {
    exportedAt: new Date().toISOString(),
    user: req.user,
    families: await q(`SELECT f.id, f.name, fm.role, fm.joined_at FROM family_members fm JOIN families f ON f.id = fm.family_id WHERE fm.user_id = $1`),
    accounts: await q(`SELECT a.*, o.share_pct FROM accounts a JOIN account_owners o ON o.account_id = a.id WHERE o.user_id = $1 AND a.deleted_at IS NULL`),
    holdings: await q(`SELECT h.* FROM holdings h JOIN account_owners o ON o.account_id = h.account_id WHERE o.user_id = $1`),
    liabilities: await q(`SELECT l.*, o.share_pct FROM liabilities l JOIN liability_owners o ON o.liability_id = l.id WHERE o.user_id = $1 AND l.deleted_at IS NULL`),
    cashflows: await q(`SELECT c.*, o.share_pct FROM cashflows c JOIN cashflow_owners o ON o.cashflow_id = c.id WHERE o.user_id = $1 AND c.deleted_at IS NULL`),
    simulations: await q('SELECT id, kind, name, input, output, created_at FROM simulations WHERE created_by = $1'),
    proposals: await q('SELECT id, kind, title, description, amount, status, created_at FROM proposals WHERE created_by = $1'),
    consents: await q('SELECT scope, granted_at, revoked_at FROM consents WHERE user_id = $1'),
    concallAnalyses: await q('SELECT id, ticker, company, quarter, fiscal_year, created_at FROM concall_analyses WHERE user_id = $1'),
    brokerConnections: await q('SELECT broker, broker_user_id, connected_at, expires_at, revoked_at FROM broker_connections WHERE user_id = $1'),
  };
  await audit({ actorId: id, action: 'user.export', entityType: 'user', entityId: id, ip: req.ip });
  res.setHeader('Content-Disposition', `attachment; filename="finsight-export-${new Date().toISOString().slice(0, 10)}.json"`);
  res.json(data);
}));

// ---- Account deletion ----------------------------------------------------------
// Requires the password. Blocks if the user owns a family with other members.
// Records owned solely by the user are deleted; joint records lose the user's share.
router.post('/delete', wrap(async (req, res) => {
  const { password, confirm } = validate(z.object({ password: z.string().min(1), confirm: z.literal('DELETE') }).strict(), req.body);
  const id = req.user.id;
  const { rows } = await db.query('SELECT * FROM users WHERE id = $1', [id]);
  const ok = await verifyPassword(password, rows[0].password_salt, rows[0].password_hash, rows[0].password_iters);
  if (!ok) throw new HttpError(401, 'INVALID_CREDENTIALS', 'Password is incorrect.');

  const owned = await db.query(
    `SELECT f.id, f.name, (SELECT count(*)::int FROM family_members m WHERE m.family_id = f.id AND m.status = 'active') AS n
     FROM families f JOIN family_members fm ON fm.family_id = f.id WHERE fm.user_id = $1 AND fm.role = 'owner' AND fm.status = 'active'`, [id]);
  const blocking = owned.rows.filter((f) => f.n > 1);
  if (blocking.length) throw conflict(`Transfer ownership of ${blocking.map((f) => f.name).join(', ')} before deleting your account.`);

  // Meko memories are removed first so a failure leaves the account intact and retryable.
  const mekoResult = await require('../services/meko/personMemory').deleteAllForUser(id).catch((err) => ({ ok: false, error: err.message }));
  // Older family-context memories (before person memory) are removed too.
  await require('../services/meko/contextService').deleteAllForUser(id).catch(() => {});
  if (mekoResult && mekoResult.ok === false && mekoResult.required) {
    throw badRequest(`Could not delete stored AI context: ${mekoResult.error}. Please retry.`);
  }

  await db.withTransaction(async (c) => {
    for (const f of owned.rows) await c.query('DELETE FROM families WHERE id = $1', [f.id]);
    for (const [table, owners, fk] of [['accounts', 'account_owners', 'account_id'], ['liabilities', 'liability_owners', 'liability_id'], ['cashflows', 'cashflow_owners', 'cashflow_id']]) {
      await c.query(
        `UPDATE ${table} SET deleted_at = now() WHERE id IN (
           SELECT o.${fk} FROM ${owners} o WHERE o.user_id = $1
           AND NOT EXISTS (SELECT 1 FROM ${owners} x WHERE x.${fk} = o.${fk} AND x.user_id <> $1))`, [id]);
      await c.query(`DELETE FROM ${owners} WHERE user_id = $1`, [id]);
    }
    await c.query("UPDATE family_members SET status = 'removed' WHERE user_id = $1", [id]);
    for (const t of ['sessions', 'broker_connections', 'consents', 'concall_analyses', 'simulations', 'score_snapshots', 'oauth_states', 'usage_counters']) {
      const col = t === 'simulations' ? 'created_by' : t === 'score_snapshots' ? 'viewer_id' : 'user_id';
      await c.query(`DELETE FROM ${t} WHERE ${col} = $1`, [id]);
    }
    await c.query(
      `UPDATE users SET email = $2, name = 'Deleted user', password_hash = '', password_salt = '', deleted_at = now(), updated_at = now() WHERE id = $1`,
      [id, `deleted-${id}@deleted.invalid`]);
    await audit({ actorId: id, action: 'user.delete', entityType: 'user', entityId: id, ip: req.ip }, c);
  });
  res.clearCookie(COOKIE_NAME, { path: '/' });
  res.json({ success: true, message: 'Your account and personal data have been deleted.', meko: mekoResult });
}));

module.exports = router;
