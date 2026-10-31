// Family contextual memory backed by Meko, with YugabyteDB as the authority.
//
// Isolation model
//  - Shared family context lives in the family's own Meko datapack.
//  - A member's private context lives in that user's own datapack, so it is never
//    in a datapack another member's searches touch.
//  - Every memory is indexed in context_memories. Search results from Meko are
//    returned only if they map to an index row the viewer may see. Unknown or
//    foreign ids are dropped.
//  - Only approved, sanitised summaries are stored. Account numbers, PAN, Aadhaar,
//    IFSC, card numbers, emails, phone numbers and API tokens are redacted first.
//  - Meko is never a source of balances: the agent reads numbers from YugabyteDB.
//
// When Meko is disabled or unreachable, memories are still saved to the index and
// search falls back to a local keyword search, clearly labelled as such.
const { randomUUID } = require('crypto');
const { z } = require('zod');
const db = require('../../db/pool');
const meko = require('./client');
const { audit } = require('../../lib/audit');
const { validate, forbidden, notFound, HttpError } = require('../../lib/http');
const familyService = require('../familyService');

const AGENT_ID = process.env.MEKO_AGENT_ID || 'liquidityos_backend';
const PREFIX = (process.env.MEKO_DATAPACK_PREFIX || 'liquidityos').replace(/[^a-z0-9-]/gi, '').toLowerCase();
const KINDS = ['goal', 'preference', 'decision', 'investment_reasoning', 'stress_summary', 'company_research', 'note'];

// ---- Sanitisation -------------------------------------------------------------
const REDACTIONS = [
  { name: 'api_token', re: /\b(?:mko|sk|los|pk|rk|ghp|xox[bp])[_-][A-Za-z0-9_-]{12,}\b/g },
  { name: 'card_number', re: /\b(?:\d[ -]?){13,19}\b/g },
  { name: 'aadhaar', re: /\b\d{4}[ -]?\d{4}[ -]?\d{4}\b/g },
  { name: 'account_number', re: /\b\d{9,18}\b/g },
  { name: 'pan', re: /\b[A-Z]{5}\d{4}[A-Z]\b/g },
  { name: 'ifsc', re: /\b[A-Z]{4}0[A-Z0-9]{6}\b/g },
  { name: 'email', re: /\b[^\s@]+@[^\s@]+\.[a-z]{2,}\b/gi },
  { name: 'phone', re: /(?:\+91[ -]?)?\b[6-9]\d{9}\b/g },
];

function sanitise(text) {
  let out = String(text || '');
  const found = new Set();
  for (const r of REDACTIONS) {
    out = out.replace(r.re, () => { found.add(r.name); return `[${r.name.replace('_', ' ')} removed]`; });
  }
  return { text: out.replace(/\s+/g, ' ').trim(), redactions: [...found] };
}

// ---- Bindings -------------------------------------------------------------------
function pickId(data, keys) {
  if (!data || typeof data !== 'object') return null;
  for (const k of keys) if (typeof data[k] === 'string' && data[k]) return data[k];
  for (const v of Object.values(data)) {
    if (v && typeof v === 'object' && !Array.isArray(v)) {
      const inner = pickId(v, keys);
      if (inner) return inner;
    }
  }
  return null;
}

/**
 * Live Meko requires a conversation_id even for account-level calls such as
 * datapack_create / datapack_delete. We keep one "control" conversation in the
 * account's default datapack (conversation_create without datapack_id resolves
 * to the default) and reuse it; its id is stored in meko_settings.
 */
let controlConversation = null;
async function controlConversationId() {
  if (controlConversation) return controlConversation;
  const { rows } = await db.query("SELECT value FROM meko_settings WHERE key = 'control_conversation_id'");
  if (rows[0]) { controlConversation = rows[0].value; return controlConversation; }
  const conv = await meko.callTool('conversation_create', { agent_id: AGENT_ID, title: 'LiquidityOS backend (control)' });
  const id = pickId(conv, ['id', 'conversation_id']);
  if (!id) throw new meko.MekoError('Meko did not return a conversation id for the control conversation.', 'MEKO_BAD_RESPONSE');
  await db.query(
    `INSERT INTO meko_settings (key, value) VALUES ('control_conversation_id', $1)
     ON CONFLICT (key) DO NOTHING`, [id]);
  const again = await db.query("SELECT value FROM meko_settings WHERE key = 'control_conversation_id'");
  controlConversation = again.rows[0].value;
  return controlConversation;
}

async function binding(scopeType, scopeId, { create = true } = {}) {
  const { rows } = await db.query('SELECT * FROM meko_bindings WHERE scope_type = $1 AND scope_id = $2', [scopeType, scopeId]);
  if (rows[0] || !create) return rows[0] || null;
  const name = `${PREFIX}-${scopeType}-${scopeId}`;
  const dp = await meko.callTool('datapack_create', { name, conversation_id: await controlConversationId() });
  const datapackId = pickId(dp, ['datapack_id', 'id']);
  if (!datapackId) throw new meko.MekoError('Meko did not return a datapack id.', 'MEKO_BAD_RESPONSE');
  const conv = await meko.callTool('conversation_create', { datapack_id: datapackId, agent_id: AGENT_ID, title: `LiquidityOS ${scopeType} context` });
  const conversationId = pickId(conv, ['id', 'conversation_id']);
  if (!conversationId) throw new meko.MekoError('Meko did not return a conversation id.', 'MEKO_BAD_RESPONSE');
  await db.query(
    `INSERT INTO meko_bindings (scope_type, scope_id, datapack_id, datapack_name, conversation_id) VALUES ($1,$2,$3,$4,$5)
     ON CONFLICT (scope_type, scope_id) DO NOTHING`, [scopeType, scopeId, datapackId, name, conversationId]);
  const again = await db.query('SELECT * FROM meko_bindings WHERE scope_type = $1 AND scope_id = $2', [scopeType, scopeId]);
  return again.rows[0];
}

/** Collects memory ids from a memory_add/search response, whatever its envelope. */
function collectMemories(data) {
  const list = Array.isArray(data) ? data : Array.isArray(data?.results) ? data.results : Array.isArray(data?.memories) ? data.memories : data?.id ? [data] : [];
  return list.filter((m) => m && typeof m.id === 'string').map((m) => ({
    id: m.id, text: m.memory ?? m.text ?? null, score: typeof m.score === 'number' ? m.score : null,
    event: m.event || null, metadata: m.metadata || null,
  }));
}

// ---- Permissions ------------------------------------------------------------------
async function hasConsent(userId) {
  const { rowCount } = await db.query("SELECT 1 FROM consents WHERE user_id = $1 AND scope = 'meko_context' AND revoked_at IS NULL", [userId]);
  return rowCount > 0;
}

async function requireConsent(userId) {
  if (!(await hasConsent(userId))) {
    throw new HttpError(403, 'CONSENT_REQUIRED', 'Turn on "Remember decisions and preferences" in Settings before saving context.');
  }
}

function visibleRowsQuery() {
  return `SELECT * FROM context_memories WHERE family_id = $1 AND status = 'active' AND (owner_user_id IS NULL OR owner_user_id = $2)`;
}

function toApi(r) {
  return {
    id: r.id, kind: r.kind, title: r.title, body: r.body, private: Boolean(r.owner_user_id), sources: r.sources,
    related: r.related_type ? { type: r.related_type, id: r.related_id } : null, createdBy: r.created_by,
    syncStatus: r.sync_status, syncError: r.sync_error, createdAt: r.created_at, updatedAt: r.updated_at,
  };
}

// ---- Operations -------------------------------------------------------------------
const addSchema = z.object({
  kind: z.enum(KINDS),
  title: z.string().trim().min(3).max(160),
  body: z.string().trim().min(10).max(4000),
  private: z.boolean().default(false),
  sources: z.array(z.object({ label: z.string().max(200), url: z.string().url().max(500).refine((u) => /^https?:\/\//i.test(u), 'Only http(s) links are allowed').optional(), at: z.string().max(40).optional() })).max(20).default([]),
  related: z.object({ type: z.enum(['proposal', 'simulation', 'concall', 'evaluation']), id: z.string().max(80) }).optional(),
}).strict();

async function syncToMeko(row) {
  if (!meko.isEnabled()) {
    await db.query("UPDATE context_memories SET sync_status = 'disabled' WHERE id = $1", [row.id]);
    return { status: 'disabled' };
  }
  try {
    const b = row.owner_user_id ? await binding('user', row.owner_user_id) : await binding('family', row.family_id);
    const text = `[${row.kind}] ${row.title}: ${row.body}`;
    const res = await meko.callTool('memory_add', {
      text, conversation_id: b.conversation_id, datapack_id: b.datapack_id, agent_id: AGENT_ID,
      metadata: JSON.stringify({ los_memory_id: row.id, kind: row.kind, family_id: row.family_id, created_at: row.created_at }),
    });
    const ids = collectMemories(res).filter((m) => m.event !== 'DELETE').map((m) => m.id);
    await db.query(
      `UPDATE context_memories SET meko_ids = $2, meko_datapack = $3, sync_status = 'synced', sync_error = $4, updated_at = now() WHERE id = $1`,
      [row.id, JSON.stringify(ids), b.datapack_id, ids.length ? null : 'Meko did not create a separate memory for this text (it may already know it).']);
    return { status: 'synced', ids };
  } catch (err) {
    await db.query("UPDATE context_memories SET sync_status = 'failed', sync_error = $2 WHERE id = $1", [row.id, String(err.message).slice(0, 500)]);
    return { status: 'failed', error: err.message };
  }
}

async function add(familyId, actorId, body, ip) {
  const input = validate(addSchema, body);
  await familyService.requireRole(familyId, actorId, input.private ? 'viewer' : 'member');
  await requireConsent(actorId);
  const title = sanitise(input.title);
  const text = sanitise(input.body);
  const id = randomUUID();
  const { rows } = await db.query(
    `INSERT INTO context_memories (id, family_id, owner_user_id, created_by, kind, title, body, sources, related_type, related_id)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING *`,
    [id, familyId, input.private ? actorId : null, actorId, input.kind, title.text, text.text, JSON.stringify(input.sources),
      input.related?.type || null, input.related?.id || null]);
  const sync = await syncToMeko(rows[0]);
  await audit({ familyId, actorId, action: 'context.add', entityType: 'context', entityId: id, details: { kind: input.kind, private: input.private, sync: sync.status }, ip });
  const fresh = await db.query('SELECT * FROM context_memories WHERE id = $1', [id]);
  return { memory: toApi(fresh.rows[0]), redactions: [...new Set([...title.redactions, ...text.redactions])], sync };
}

async function list(familyId, viewerId, { kind } = {}) {
  await familyService.requireRole(familyId, viewerId, 'viewer');
  const params = [familyId, viewerId];
  let sql = visibleRowsQuery();
  if (kind) { params.push(kind); sql += ` AND kind = $${params.length}`; }
  const { rows } = await db.query(`${sql} ORDER BY created_at DESC LIMIT 200`, params);
  return rows.map(toApi);
}

function localSearch(rows, query, limit) {
  const terms = String(query).toLowerCase().split(/\W+/).filter((t) => t.length > 2);
  return rows
    .map((r) => {
      const hay = `${r.title} ${r.body} ${r.kind}`.toLowerCase();
      const hits = terms.filter((t) => hay.includes(t)).length;
      return { row: r, score: terms.length ? hits / terms.length : 0 };
    })
    .filter((x) => x.score > 0)
    .sort((a, b) => b.score - a.score || new Date(b.row.created_at) - new Date(a.row.created_at))
    .slice(0, limit);
}

/**
 * Searches the viewer's allowed context. Returns canonical rows from the index,
 * ranked by Meko when available, else by a local keyword match.
 */
async function search(familyId, viewerId, query, { limit = 8, kinds } = {}) {
  await familyService.requireRole(familyId, viewerId, 'viewer');
  const q = String(query || '').trim().slice(0, 500);
  if (!q) return { results: [], source: 'none' };
  const { rows } = await db.query(visibleRowsQuery(), [familyId, viewerId]);
  const allowed = rows.filter((r) => !kinds || kinds.includes(r.kind));
  const byMekoId = new Map();
  const byLocalId = new Map(allowed.map((r) => [r.id, r]));
  for (const r of allowed) for (const mid of r.meko_ids || []) byMekoId.set(mid, r);

  if (meko.isEnabled()) {
    try {
      const scopes = [['family', familyId], ['user', viewerId]];
      const seen = new Set();
      const results = [];
      for (const [type, id] of scopes) {
        const b = await binding(type, id, { create: false });
        if (!b) continue;
        const res = await meko.callTool('memory_search', { query: q, conversation_id: b.conversation_id, datapack_id: b.datapack_id, agent_id: AGENT_ID, limit: Math.min(50, limit * 3) });
        for (const m of collectMemories(res)) {
          // Map back to an index row the viewer may see; drop anything else.
          const row = byMekoId.get(m.id) || (m.metadata?.los_memory_id && byLocalId.get(m.metadata.los_memory_id));
          if (!row || seen.has(row.id)) continue;
          seen.add(row.id);
          results.push({ ...toApi(row), relevance: m.score, matchedText: m.text });
        }
      }
      results.sort((a, b) => (b.relevance ?? 0) - (a.relevance ?? 0));
      // Memories saved while Meko was down aren't in Meko yet; include keyword matches for them.
      for (const x of localSearch(allowed.filter((r) => r.sync_status !== 'synced' && !seen.has(r.id)), q, limit)) {
        results.push({ ...toApi(x.row), relevance: null, matchedText: null });
      }
      return { results: results.slice(0, limit), source: 'meko' };
    } catch (err) {
      const local = localSearch(allowed, q, limit).map((x) => ({ ...toApi(x.row), relevance: x.score }));
      return { results: local, source: 'local_index', degraded: `Meko unavailable (${err.message}); used keyword search instead.` };
    }
  }
  return { results: localSearch(allowed, q, limit).map((x) => ({ ...toApi(x.row), relevance: x.score })), source: 'local_index', degraded: 'Meko is not enabled; used keyword search.' };
}

async function loadEditable(familyId, actorId, id) {
  if (!/^[0-9a-f-]{36}$/i.test(String(id))) throw notFound('Memory not found.');
  const m = await familyService.requireRole(familyId, actorId, 'viewer');
  const { rows } = await db.query("SELECT * FROM context_memories WHERE id = $1 AND family_id = $2 AND status = 'active'", [id, familyId]);
  const r = rows[0];
  if (!r || (r.owner_user_id && r.owner_user_id !== actorId)) throw notFound('Memory not found.');
  const can = r.owner_user_id === actorId || r.created_by === actorId || (!r.owner_user_id && ['owner', 'admin'].includes(m.role));
  if (!can) throw forbidden('Only the author or a family admin can change shared context.');
  return r;
}

async function deleteFromMeko(row) {
  if (!row.meko_ids?.length || !row.meko_datapack) return;
  if (!meko.isEnabled()) throw new HttpError(503, 'MEKO_DISABLED', 'This memory is stored in Meko, but Meko is disabled, so it cannot be deleted there yet.');
  const b = row.owner_user_id ? await binding('user', row.owner_user_id, { create: false }) : await binding('family', row.family_id, { create: false });
  for (const mid of row.meko_ids) {
    try {
      await meko.callTool('memory_delete_by_id', { memory_id: mid, conversation_id: b.conversation_id, datapack_id: row.meko_datapack, agent_id: AGENT_ID });
    } catch (err) {
      if (!/not.?found/i.test(err.message)) throw new HttpError(502, 'MEKO_DELETE_FAILED', `Could not delete from Meko: ${err.message}. Nothing was removed; please retry.`);
    }
  }
}

async function remove(familyId, actorId, id, ip) {
  const row = await loadEditable(familyId, actorId, id);
  await deleteFromMeko(row);
  // Erase the content, keep a tombstone for the audit trail.
  await db.query("UPDATE context_memories SET status = 'deleted', title = '[deleted]', body = '', meko_ids = '[]'::jsonb, updated_at = now() WHERE id = $1", [id]);
  await audit({ familyId, actorId, action: 'context.delete', entityType: 'context', entityId: id, ip });
}

/** Corrections supersede: the old memory is removed from Meko and a new one is written. */
async function correct(familyId, actorId, id, body, ip) {
  const row = await loadEditable(familyId, actorId, id);
  const patch = validate(addSchema.pick({ title: true, body: true }).partial(), body);
  await deleteFromMeko(row);
  const created = await add(familyId, actorId, {
    kind: row.kind, title: patch.title || row.title, body: patch.body || row.body, private: Boolean(row.owner_user_id),
    sources: row.sources, ...(row.related_type ? { related: { type: row.related_type, id: row.related_id } } : {}),
  }, ip);
  await db.query("UPDATE context_memories SET status = 'superseded', superseded_by = $2, meko_ids = '[]'::jsonb, updated_at = now() WHERE id = $1", [id, created.memory.id]);
  await audit({ familyId, actorId, action: 'context.correct', entityType: 'context', entityId: id, details: { supersededBy: created.memory.id }, ip });
  return created;
}

/** Retry Meko sync for memories that failed or were saved while Meko was disabled. */
async function resync(familyId, actorId) {
  await familyService.requireRole(familyId, actorId, 'member');
  const { rows } = await db.query(
    `${visibleRowsQuery()} AND sync_status IN ('failed','disabled','pending')`, [familyId, actorId]);
  const out = [];
  for (const r of rows) out.push({ id: r.id, ...(await syncToMeko(r)) });
  return out;
}

/** Account deletion: removes the user's private datapack and private memories. */
async function deleteAllForUser(userId) {
  const { rows } = await db.query("SELECT * FROM context_memories WHERE owner_user_id = $1 AND status <> 'deleted'", [userId]);
  const b = await binding('user', userId, { create: false });
  if (b) {
    if (!meko.isEnabled()) return { ok: false, required: true, error: 'Meko is disabled, so your private Meko datapack cannot be deleted yet' };
    try {
      await meko.callTool('datapack_delete', { datapack_id: b.datapack_id, conversation_id: await controlConversationId() });
    } catch (err) {
      return { ok: false, required: true, error: err.message };
    }
    await db.query("DELETE FROM meko_bindings WHERE scope_type = 'user' AND scope_id = $1", [userId]);
  }
  await db.query("UPDATE context_memories SET status = 'deleted', title = '[deleted]', body = '', meko_ids = '[]'::jsonb WHERE owner_user_id = $1", [userId]);
  return { ok: true, privateMemoriesDeleted: rows.length, datapackDeleted: Boolean(b) };
}

/** Family deletion: removes the family's shared datapack (best effort, reported). */
async function deleteFamilyContext(familyId) {
  const b = await binding('family', familyId, { create: false });
  if (!b) return { ok: true, datapackDeleted: false };
  if (!meko.isEnabled()) return { ok: false, error: 'Meko disabled' };
  try {
    await meko.callTool('datapack_delete', { datapack_id: b.datapack_id, conversation_id: await controlConversationId() });
    await db.query("DELETE FROM meko_bindings WHERE scope_type = 'family' AND scope_id = $1", [familyId]);
    return { ok: true, datapackDeleted: true };
  } catch (err) {
    return { ok: false, error: err.message };
  }
}

module.exports = { add, list, search, remove, correct, resync, deleteAllForUser, deleteFamilyContext, sanitise, collectMemories, hasConsent, KINDS };
