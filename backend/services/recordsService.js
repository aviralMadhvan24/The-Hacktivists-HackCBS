// CRUD for accounts, liabilities and cash flows (each with ownership shares),
// plus holdings and transactions under accounts.
//
// Visibility
//   'family'  – every active family member can see it.
//   'private' – only the record's owners can see it. Never included in anyone
//               else's family view, totals or counts.
// Editing
//   private record → an owner with role ≥ member.
//   family record  → an owner with role ≥ member, or any admin/owner.
// Creating (role ≥ member): owners must be active members; non-admins must be
//   among the owners; private records must include the creator as an owner.
const { randomUUID } = require('crypto');
const { z } = require('zod');
const db = require('../db/pool');
const { audit } = require('../lib/audit');
const { validate, notFound, forbidden, badRequest } = require('../lib/http');
const { validateOwners } = require('../engine/consolidation');
const familyService = require('./familyService');

const { ROLE_RANK } = familyService;

const money = z.number().finite().min(0).max(1e13);
const ownersSchema = z.array(z.object({ userId: z.string().uuid(), sharePct: z.number().gt(0).max(100) })).min(1).max(20);
const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use YYYY-MM-DD');

const ACCOUNT_KINDS = ['bank', 'cash', 'savings', 'fixed_deposit', 'brokerage', 'mutual_fund', 'retirement', 'gold', 'real_estate', 'other'];
const DEFAULT_LIQUIDITY = {
  bank: 'liquid', cash: 'liquid', savings: 'liquid', fixed_deposit: 'semi_liquid', brokerage: 'semi_liquid',
  mutual_fund: 'semi_liquid', gold: 'semi_liquid', retirement: 'illiquid', real_estate: 'illiquid', other: 'illiquid',
};
const DEFAULT_EQUITY_PCT = { brokerage: 100, mutual_fund: 100 };

// ---- Entity definitions -----------------------------------------------------
const ENTITIES = {
  accounts: {
    table: 'accounts', ownersTable: 'account_owners', fk: 'account_id', label: 'account',
    create: z.object({
      name: z.string().trim().min(1).max(120),
      kind: z.enum(ACCOUNT_KINDS),
      liquidity: z.enum(['liquid', 'semi_liquid', 'illiquid']).optional(),
      value: money.optional(),
      valueSource: z.enum(['manual', 'holdings']).optional(),
      equityPct: z.number().min(0).max(100).optional(),
      visibility: z.enum(['private', 'family']).default('family'),
      institution: z.string().trim().max(120).optional().nullable(),
      maturityDate: date.optional().nullable(),
      notes: z.string().max(1000).optional().nullable(),
      owners: ownersSchema,
    }).strict(),
    columns: { name: 'name', kind: 'kind', liquidity: 'liquidity', value: 'value', valueSource: 'value_source', equityPct: 'equity_pct', visibility: 'visibility', institution: 'institution', maturityDate: 'maturity_date', notes: 'notes' },
    defaults: (d) => ({
      liquidity: d.liquidity || DEFAULT_LIQUIDITY[d.kind],
      valueSource: d.valueSource || (d.kind === 'brokerage' ? 'holdings' : 'manual'),
      equityPct: d.equityPct ?? DEFAULT_EQUITY_PCT[d.kind] ?? 0,
      value: d.value ?? 0,
    }),
  },
  liabilities: {
    table: 'liabilities', ownersTable: 'liability_owners', fk: 'liability_id', label: 'liability',
    create: z.object({
      name: z.string().trim().min(1).max(120),
      kind: z.enum(['home_loan', 'car_loan', 'personal_loan', 'education_loan', 'credit_card', 'gold_loan', 'business_loan', 'other']),
      outstanding: money,
      interestRatePct: z.number().min(0).max(100).optional().nullable(),
      emiMonthly: money.default(0),
      remainingMonths: z.number().int().min(0).max(600).optional().nullable(),
      rateType: z.enum(['fixed', 'floating']).default('fixed'),
      visibility: z.enum(['private', 'family']).default('family'),
      lender: z.string().trim().max(120).optional().nullable(),
      notes: z.string().max(1000).optional().nullable(),
      owners: ownersSchema,
    }).strict(),
    columns: { name: 'name', kind: 'kind', outstanding: 'outstanding', interestRatePct: 'interest_rate_pct', emiMonthly: 'emi_monthly', remainingMonths: 'remaining_months', rateType: 'rate_type', visibility: 'visibility', lender: 'lender', notes: 'notes' },
    defaults: () => ({}),
  },
  cashflows: {
    table: 'cashflows', ownersTable: 'cashflow_owners', fk: 'cashflow_id', label: 'cash flow',
    create: z.object({
      direction: z.enum(['income', 'expense']),
      category: z.string().trim().min(1).max(60),
      name: z.string().trim().min(1).max(120),
      amount: money,
      frequency: z.enum(['monthly', 'quarterly', 'half_yearly', 'yearly']).default('monthly'),
      essential: z.boolean().default(true),
      visibility: z.enum(['private', 'family']).default('family'),
      startsOn: date.optional().nullable(),
      endsOn: date.optional().nullable(),
      owners: ownersSchema,
    }).strict(),
    columns: { direction: 'direction', category: 'category', name: 'name', amount: 'amount', frequency: 'frequency', essential: 'essential', visibility: 'visibility', startsOn: 'starts_on', endsOn: 'ends_on' },
    defaults: () => ({}),
  },
};

function toApi(entity, row, owners) {
  const out = { id: row.id, familyId: row.family_id, createdBy: row.created_by, createdAt: row.created_at, updatedAt: row.updated_at };
  for (const [api, col] of Object.entries(ENTITIES[entity].columns)) out[api] = row[col];
  out.owners = owners || [];
  return out;
}

async function ownersFor(entity, ids, client = db) {
  const e = ENTITIES[entity];
  if (!ids.length) return new Map();
  const { rows } = await client.query(
    `SELECT o.${e.fk} AS rid, o.user_id, o.share_pct, u.name FROM ${e.ownersTable} o JOIN users u ON u.id = o.user_id WHERE o.${e.fk} = ANY($1::uuid[])`,
    [ids]);
  const map = new Map();
  for (const r of rows) {
    if (!map.has(r.rid)) map.set(r.rid, []);
    map.get(r.rid).push({ userId: r.user_id, sharePct: r.share_pct, name: r.name });
  }
  return map;
}

/** Visible, non-deleted records of one entity type for a viewer. */
async function listVisible(entity, familyId, viewerId, client = db) {
  const e = ENTITIES[entity];
  const { rows } = await client.query(
    `SELECT r.* FROM ${e.table} r
     WHERE r.family_id = $1 AND r.deleted_at IS NULL
       AND (r.visibility = 'family' OR EXISTS (SELECT 1 FROM ${e.ownersTable} o WHERE o.${e.fk} = r.id AND o.user_id = $2))
     ORDER BY r.created_at`,
    [familyId, viewerId]);
  const owners = await ownersFor(entity, rows.map((r) => r.id), client);
  return rows.map((r) => toApi(entity, r, owners.get(r.id)));
}

async function checkOwners(familyId, owners, creatorId, role, visibility) {
  const err = validateOwners(owners);
  if (err) throw badRequest(err);
  const members = new Set(await familyService.activeMemberIds(familyId));
  for (const o of owners) if (!members.has(o.userId)) throw badRequest('Every owner must be an active member of this family.');
  const ownsIt = owners.some((o) => o.userId === creatorId);
  if (visibility === 'private' && !ownsIt) throw badRequest('You must be an owner of a private record.');
  if (ROLE_RANK[role] < ROLE_RANK.admin && !ownsIt) throw forbidden('Members can only add records they co-own. Ask an admin to add records for others.');
}

async function create(entity, familyId, actorId, body, ip) {
  const e = ENTITIES[entity];
  const m = await familyService.requireRole(familyId, actorId, 'member');
  const data = validate(e.create, body);
  Object.assign(data, e.defaults(data));
  await checkOwners(familyId, data.owners, actorId, m.role, data.visibility);
  const id = randomUUID();
  const cols = Object.entries(e.columns).filter(([api]) => data[api] !== undefined);
  await db.withTransaction(async (c) => {
    await c.query(
      `INSERT INTO ${e.table} (id, family_id, created_by, ${cols.map(([, col]) => col).join(', ')})
       VALUES ($1, $2, $3, ${cols.map((_, i) => `$${i + 4}`).join(', ')})`,
      [id, familyId, actorId, ...cols.map(([api]) => data[api])]);
    for (const o of data.owners) {
      await c.query(`INSERT INTO ${e.ownersTable} (${e.fk}, user_id, share_pct) VALUES ($1,$2,$3)`, [id, o.userId, o.sharePct]);
    }
    await audit({ familyId, actorId, action: `${e.label}.create`, entityType: entity, entityId: id, details: { name: data.name, visibility: data.visibility }, ip }, c);
  });
  return get(entity, familyId, actorId, id);
}

async function loadForEdit(entity, familyId, actorId, id, client = db) {
  const e = ENTITIES[entity];
  const m = await familyService.requireRole(familyId, actorId, 'viewer', client);
  const { rows } = await client.query(`SELECT * FROM ${e.table} WHERE id = $1 AND family_id = $2 AND deleted_at IS NULL`, [id, familyId]);
  const row = rows[0];
  if (!row) throw notFound(`That ${e.label} was not found.`);
  const owners = (await ownersFor(entity, [id], client)).get(id) || [];
  const isOwner = owners.some((o) => o.userId === actorId);
  if (row.visibility === 'private' && !isOwner) throw notFound(`That ${e.label} was not found.`);
  const canEdit = ROLE_RANK[m.role] >= ROLE_RANK.member
    && (isOwner || (row.visibility === 'family' && ROLE_RANK[m.role] >= ROLE_RANK.admin));
  return { row, owners, membership: m, canEdit };
}

async function get(entity, familyId, actorId, id) {
  const { row, owners, canEdit } = await loadForEdit(entity, familyId, actorId, id);
  return { ...toApi(entity, row, owners), canEdit };
}

async function update(entity, familyId, actorId, id, body, ip) {
  const e = ENTITIES[entity];
  const { row, membership, canEdit } = await loadForEdit(entity, familyId, actorId, id);
  if (!canEdit) throw forbidden(`You can't edit this ${e.label}.`);
  const data = validate(e.create.partial(), body);
  const visibility = data.visibility || row.visibility;
  if (data.owners) await checkOwners(familyId, data.owners, actorId, membership.role, visibility);
  else if (data.visibility === 'private') {
    const owners = (await ownersFor(entity, [id])).get(id) || [];
    if (!owners.some((o) => o.userId === actorId)) throw badRequest('You must be an owner of a private record.');
  }
  const cols = Object.entries(e.columns).filter(([api]) => data[api] !== undefined);
  await db.withTransaction(async (c) => {
    if (cols.length) {
      await c.query(
        `UPDATE ${e.table} SET ${cols.map(([, col], i) => `${col} = $${i + 2}`).join(', ')}, updated_at = now() WHERE id = $1`,
        [id, ...cols.map(([api]) => data[api])]);
    }
    if (data.owners) {
      await c.query(`DELETE FROM ${e.ownersTable} WHERE ${e.fk} = $1`, [id]);
      for (const o of data.owners) await c.query(`INSERT INTO ${e.ownersTable} (${e.fk}, user_id, share_pct) VALUES ($1,$2,$3)`, [id, o.userId, o.sharePct]);
    }
    await audit({ familyId, actorId, action: `${e.label}.update`, entityType: entity, entityId: id, details: { fields: Object.keys(data) }, ip }, c);
  });
  return get(entity, familyId, actorId, id);
}

async function remove(entity, familyId, actorId, id, ip) {
  const e = ENTITIES[entity];
  const { canEdit } = await loadForEdit(entity, familyId, actorId, id);
  if (!canEdit) throw forbidden(`You can't delete this ${e.label}.`);
  await db.query(`UPDATE ${e.table} SET deleted_at = now() WHERE id = $1`, [id]);
  await audit({ familyId, actorId, action: `${e.label}.delete`, entityType: entity, entityId: id, ip });
}

// ---- Holdings -----------------------------------------------------------------
const holdingSchema = z.object({
  symbol: z.string().trim().min(1).max(30).transform((s) => s.toUpperCase().replace(/\.(NS|BO)$/, '')),
  exchange: z.enum(['NSE', 'BSE']).default('NSE'),
  isin: z.string().trim().regex(/^IN[A-Z0-9]{10}$/, 'ISIN must look like INE002A01018').optional().nullable(),
  name: z.string().trim().max(160).optional().nullable(),
  sector: z.string().trim().max(80).optional().nullable(),
  instrument: z.enum(['equity', 'etf', 'mutual_fund', 'bond']).default('equity'),
  quantity: z.number().finite().min(0).max(1e10),
  avgPrice: z.number().finite().min(0).max(1e9).default(0),
  lastPrice: z.number().finite().min(0).max(1e9).optional().nullable(),
}).strict();

function holdingToApi(h) {
  return {
    id: h.id, accountId: h.account_id, symbol: h.symbol, exchange: h.exchange, isin: h.isin, name: h.name, sector: h.sector,
    instrument: h.instrument, quantity: h.quantity, avgPrice: h.avg_price, lastPrice: h.last_price, priceAsOf: h.price_as_of,
    priceSource: h.price_source, source: h.source,
    value: Math.round((h.quantity * (h.last_price ?? h.avg_price)) * 100) / 100,
  };
}

async function listHoldings(familyId, actorId, accountId) {
  await loadForEdit('accounts', familyId, actorId, accountId); // visibility check
  const { rows } = await db.query('SELECT * FROM holdings WHERE account_id = $1 ORDER BY symbol', [accountId]);
  return rows.map(holdingToApi);
}

async function upsertHolding(familyId, actorId, accountId, body, ip) {
  const { canEdit } = await loadForEdit('accounts', familyId, actorId, accountId);
  if (!canEdit) throw forbidden("You can't edit this account.");
  const h = validate(holdingSchema, body);
  const id = randomUUID();
  const { rows } = await db.query(
    `INSERT INTO holdings (id, account_id, symbol, exchange, isin, name, sector, instrument, quantity, avg_price, last_price, price_as_of, price_source, source)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11, CASE WHEN $11::numeric IS NULL THEN NULL ELSE now() END, CASE WHEN $11::numeric IS NULL THEN NULL ELSE 'manual' END, 'manual')
     ON CONFLICT (account_id, exchange, symbol) DO UPDATE SET
       isin = EXCLUDED.isin, name = COALESCE(EXCLUDED.name, holdings.name), sector = COALESCE(EXCLUDED.sector, holdings.sector),
       instrument = EXCLUDED.instrument, quantity = EXCLUDED.quantity, avg_price = EXCLUDED.avg_price,
       last_price = COALESCE(EXCLUDED.last_price, holdings.last_price),
       price_as_of = COALESCE(EXCLUDED.price_as_of, holdings.price_as_of), price_source = COALESCE(EXCLUDED.price_source, holdings.price_source),
       updated_at = now()
     RETURNING *`,
    [id, accountId, h.symbol, h.exchange, h.isin || null, h.name || null, h.sector || null, h.instrument, h.quantity, h.avgPrice, h.lastPrice ?? null]);
  await audit({ familyId, actorId, action: 'holding.upsert', entityType: 'holding', entityId: rows[0].id, details: { symbol: h.symbol, quantity: h.quantity }, ip });
  return holdingToApi(rows[0]);
}

async function deleteHolding(familyId, actorId, accountId, holdingId, ip) {
  const { canEdit } = await loadForEdit('accounts', familyId, actorId, accountId);
  if (!canEdit) throw forbidden("You can't edit this account.");
  const r = await db.query('DELETE FROM holdings WHERE id = $1 AND account_id = $2', [holdingId, accountId]);
  if (!r.rowCount) throw notFound('Holding not found.');
  await audit({ familyId, actorId, action: 'holding.delete', entityType: 'holding', entityId: holdingId, ip });
}

/** Applies refreshed market prices to holdings (called by the price refresh job/route). */
async function applyPrices(holdingIds, quotesBySymbol) {
  let updated = 0;
  for (const { id, symbol } of holdingIds) {
    const q = quotesBySymbol[symbol];
    if (!q || !(q.currentPrice > 0) || q.freshness === 'DEMO_DATA' || q.freshness === 'UNAVAILABLE') continue;
    await db.query('UPDATE holdings SET last_price = $2, price_as_of = $3, price_source = $4, updated_at = now() WHERE id = $1',
      [id, q.currentPrice, q.timestamp || new Date().toISOString(), q.source || q.freshness]);
    updated++;
  }
  return updated;
}

// ---- Transactions -------------------------------------------------------------
const txSchema = z.object({
  occurredOn: date,
  amount: z.number().finite().min(-1e13).max(1e13).refine((v) => v !== 0, 'Amount cannot be zero'),
  category: z.string().trim().max(60).optional().nullable(),
  description: z.string().trim().max(300).optional().nullable(),
}).strict();

async function listTransactions(familyId, actorId, accountId, { limit = 100 } = {}) {
  await loadForEdit('accounts', familyId, actorId, accountId);
  const { rows } = await db.query(
    'SELECT * FROM transactions WHERE account_id = $1 ORDER BY occurred_on DESC, created_at DESC LIMIT $2', [accountId, Math.min(500, limit)]);
  return rows.map((t) => ({ id: t.id, accountId: t.account_id, occurredOn: t.occurred_on, amount: t.amount, category: t.category, description: t.description, createdBy: t.created_by }));
}

async function addTransaction(familyId, actorId, accountId, body, ip) {
  const { canEdit } = await loadForEdit('accounts', familyId, actorId, accountId);
  if (!canEdit) throw forbidden("You can't edit this account.");
  const t = validate(txSchema, body);
  const id = randomUUID();
  await db.query('INSERT INTO transactions (id, account_id, created_by, occurred_on, amount, category, description) VALUES ($1,$2,$3,$4,$5,$6,$7)',
    [id, accountId, actorId, t.occurredOn, t.amount, t.category || null, t.description || null]);
  await audit({ familyId, actorId, action: 'transaction.create', entityType: 'transaction', entityId: id, ip });
  return { id, accountId, ...t };
}

async function deleteTransaction(familyId, actorId, accountId, txId, ip) {
  const { canEdit } = await loadForEdit('accounts', familyId, actorId, accountId);
  if (!canEdit) throw forbidden("You can't edit this account.");
  const r = await db.query('DELETE FROM transactions WHERE id = $1 AND account_id = $2', [txId, accountId]);
  if (!r.rowCount) throw notFound('Transaction not found.');
  await audit({ familyId, actorId, action: 'transaction.delete', entityType: 'transaction', entityId: txId, ip });
}

/** Everything the engine needs, restricted to what the viewer may see. */
async function loadEngineData(familyId, viewerId) {
  const [accounts, liabilities, cashflows] = await Promise.all([
    listVisible('accounts', familyId, viewerId), listVisible('liabilities', familyId, viewerId), listVisible('cashflows', familyId, viewerId),
  ]);
  const accountIds = accounts.map((a) => a.id);
  const { rows } = accountIds.length
    ? await db.query('SELECT * FROM holdings WHERE account_id = ANY($1::uuid[])', [accountIds]) : { rows: [] };
  return { accounts, liabilities, cashflows, holdings: rows.map(holdingToApi) };
}

module.exports = {
  ENTITIES, ACCOUNT_KINDS, DEFAULT_LIQUIDITY, listVisible, create, get, update, remove,
  listHoldings, upsertHolding, deleteHolding, applyPrices, listTransactions, addTransaction, deleteTransaction, loadEngineData,
};
