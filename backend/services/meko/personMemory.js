// Person-level memory in Meko.
//
// Memory is never written by FinSight directly. Meko builds it from:
//   - the user's conversations with the FinSight chatbot (each turn is sent with
//     conversation_add_message; Meko extracts memories from the user's side), and
//   - the user's activity in the app (stress tests, votes, syncs, uploads), sent as
//     short first-person activity notes in the same conversation.
// Users can see what Meko remembers and ask it to forget a memory. They cannot edit it.
//
// Storage: one Meko datapack per person when the Meko plan allows it. When Meko
// refuses a new datapack (free-tier cap), the person gets their own conversation in
// the shared datapack (MEKO_DATAPACK_ID or the account default) and every read is
// filtered to that conversation. Either way, each person's memory is separate.
//
// Family planning: a member can share their memory and documents with a family.
// The family chat then searches the memory of every member who shares.
const { randomUUID } = require('crypto');
const db = require('../../db/pool');
const meko = require('./client');
const { audit } = require('../../lib/audit');
const { notFound, forbidden } = require('../../lib/http');

const AGENT_ID = process.env.MEKO_AGENT_ID || 'liquidityos_backend';
const PREFIX = (process.env.MEKO_DATAPACK_PREFIX || 'finsight').replace(/[^a-z0-9-]/gi, '').toLowerCase();
const plain = (id) => String(id || '').replace(/-/g, '').toLowerCase();

function pickId(data, keys) {
  if (!data || typeof data !== 'object') return null;
  for (const k of keys) if (typeof data[k] === 'string' && data[k]) return data[k];
  for (const v of Object.values(data)) {
    if (v && typeof v === 'object' && !Array.isArray(v)) { const r = pickId(v, keys); if (r) return r; }
  }
  return null;
}

async function hasConsent(userId) {
  const { rowCount } = await db.query("SELECT 1 FROM consents WHERE user_id = $1 AND scope = 'meko_context' AND revoked_at IS NULL", [userId]);
  return rowCount > 0;
}

// ---- Binding: where a person's memory lives -----------------------------------------
async function controlConversationId() {
  const { rows } = await db.query("SELECT value FROM meko_settings WHERE key = 'control_conversation_id'");
  if (rows[0]) return rows[0].value;
  const conv = await meko.callTool('conversation_create', { agent_id: AGENT_ID, title: 'FinSight backend (control)' });
  const id = pickId(conv, ['id', 'conversation_id']);
  await db.query("INSERT INTO meko_settings (key, value) VALUES ('control_conversation_id', $1) ON CONFLICT (key) DO NOTHING", [id]);
  return (await db.query("SELECT value FROM meko_settings WHERE key = 'control_conversation_id'")).rows[0].value;
}

/** Tries to create (or find) the person's dedicated datapack; null when Meko refuses (e.g. free-tier cap). */
async function tryCreateDatapack(userId) {
  if (process.env.MEKO_PERSON_DATAPACKS === 'never') return null;
  const name = `${PREFIX}-person-${userId}`;
  const cid = await controlConversationId();
  try {
    const dp = await meko.callTool('datapack_create', { name, conversation_id: cid });
    return pickId(dp, ['datapack_id', 'id']);
  } catch (err) {
    if (/exists/i.test(err.message)) {
      // Already created (e.g. by an earlier attempt): use it.
      const l = await meko.callTool('datapack_list', { conversation_id: cid });
      const found = (Array.isArray(l) ? l : (l?.datapacks || [])).find((d) => (d.name || d.datapack_name) === name);
      if (found) return found.id || found.datapack_id;
    }
    if (/LIMIT|quota|upgrade/i.test(err.message)) return null;
    throw err;
  }
}

// One binding setup per person at a time: concurrent actions (a chat turn and an
// app activity note) must not create two places for the same person.
const pending = new Map();

/**
 * The person's { datapack_id, conversation_id, dedicated }. Created on first use.
 * Stored in meko_bindings (scope 'user'); datapack_name records dedicated vs shared.
 */
async function binding(userId, { create = true } = {}) {
  const found = await db.query("SELECT * FROM meko_bindings WHERE scope_type = 'user' AND scope_id = $1", [userId]);
  const row = found.rows[0];
  if (row) return { datapack_id: row.datapack_id, conversation_id: row.conversation_id, dedicated: row.datapack_name !== 'shared' };
  if (!create || !meko.isEnabled()) return null;
  if (pending.has(userId)) return pending.get(userId);
  const job = createBinding(userId).finally(() => pending.delete(userId));
  pending.set(userId, job);
  return job;
}

async function createBinding(userId) {
  const user = (await db.query('SELECT name FROM users WHERE id = $1', [userId])).rows[0];
  let datapackId = await tryCreateDatapack(userId);
  const dedicated = Boolean(datapackId);
  if (!datapackId) {
    datapackId = process.env.MEKO_DATAPACK_ID || null;
    if (!datapackId) {
      // Resolve the account's default datapack id so reads can be scoped explicitly.
      const conv = await meko.callTool('conversation_list', { agent_id: AGENT_ID, limit: 1 });
      datapackId = conv?.datapack_id;
      if (!datapackId) throw new meko.MekoError('Could not resolve the Meko datapack to use.', 'MEKO_BAD_RESPONSE');
    }
  }
  const conv = await meko.callTool('conversation_create', {
    datapack_id: datapackId, agent_id: AGENT_ID, title: `${user?.name || 'User'} · FinSight`,
    metadata: JSON.stringify({ app: 'finsight', user_id: userId }),
  });
  const conversationId = pickId(conv, ['id', 'conversation_id']);
  if (!conversationId) throw new meko.MekoError('Meko did not return a conversation id.', 'MEKO_BAD_RESPONSE');
  await db.query(
    `INSERT INTO meko_bindings (scope_type, scope_id, datapack_id, datapack_name, conversation_id) VALUES ('user',$1,$2,$3,$4)
     ON CONFLICT (scope_type, scope_id) DO NOTHING`, [userId, datapackId, dedicated ? `${PREFIX}-person-${userId}` : 'shared', conversationId]);
  return binding(userId, { create: false });
}

// ---- Writing: conversations and app activity (Meko extracts the memories) -----------
async function addTurn(userId, input, output, metadata) {
  if (!meko.isEnabled() || !(await hasConsent(userId))) return { status: 'skipped' };
  const b = await binding(userId);
  await meko.callTool('conversation_add_message', {
    conversation_id: b.conversation_id, datapack_id: b.datapack_id, agent_id: AGENT_ID,
    input: String(input).slice(0, 4000), output: String(output).slice(0, 4000),
    ...(metadata ? { metadata: JSON.stringify(metadata) } : {}),
  });
  return { status: 'sent' };
}

/** One chatbot exchange. Never throws: memory must not break the chat. */
async function recordChatTurn(userId, question, answer, meta = {}) {
  try { return await addTurn(userId, question, answer, { source: 'finsight_chat', ...meta }); } catch (err) {
    console.error('Meko chat turn not stored:', err.message);
    return { status: 'failed', error: err.message };
  }
}

/**
 * An action the user took in the app, phrased in the first person so Meko treats it
 * as something the user did ("I ran a stress test ..."). Fire-and-forget.
 */
function recordActivity(userId, text, meta = {}) {
  const p = addTurn(userId, `[FinSight app activity] ${text}`, 'Noted in FinSight.', { source: 'finsight_activity', ...meta })
    .catch((err) => console.error('Meko activity not stored:', err.message));
  return process.env.NODE_ENV === 'test' ? p : undefined; // tests await it
}

// ---- Reading -------------------------------------------------------------------------
const belongs = (m, b) => b.dedicated || !m.conversation_id || plain(m.conversation_id) === plain(b.conversation_id);

/** Everything Meko remembers about the person (newest first). */
async function list(userId) {
  if (!meko.isEnabled()) return { enabled: false, memories: [] };
  const b = await binding(userId, { create: false });
  if (!b) return { enabled: true, memories: [] };
  const out = [];
  for (let page = 1; page <= 10; page++) {
    const r = await meko.callTool('memory_get_all', { conversation_id: b.conversation_id, datapack_id: b.datapack_id, page, page_size: 100 });
    const rows = r?.results || r?.memories || [];
    // Shared datapack: keep only memories extracted from this person's conversation.
    for (const m of rows) if (b.dedicated || plain(m.conversation_id) === plain(b.conversation_id)) out.push({ id: m.id, text: m.data ?? m.memory ?? '', createdAt: m.created_at || null });
    if (!r?.total_pages || page >= r.total_pages) break;
  }
  out.sort((x, y) => String(y.createdAt).localeCompare(String(x.createdAt)));
  return { enabled: true, storage: b.dedicated ? 'own datapack' : 'own conversation in a shared datapack', memories: out };
}

/** Removes one memory. Only memories that belong to the person can be removed. */
async function forget(userId, memoryId, ip) {
  if (!/^[0-9a-f-]{36}$/i.test(String(memoryId))) throw notFound('Memory not found.');
  const { memories } = await list(userId);
  if (!memories.some((m) => m.id === memoryId)) throw notFound('Memory not found.');
  const b = await binding(userId, { create: false });
  await meko.callTool('memory_delete_by_id', { memory_id: memoryId, conversation_id: b.conversation_id, datapack_id: b.datapack_id, agent_id: AGENT_ID });
  await audit({ actorId: userId, action: 'memory.forget', entityType: 'memory', entityId: memoryId, ip });
}

/** Semantic search over one person's memories. */
async function searchPerson(userId, query, limit = 6) {
  const b = await binding(userId, { create: false });
  if (!b) return [];
  const r = await meko.callTool('memory_search', {
    query: String(query).slice(0, 500), conversation_id: b.conversation_id, datapack_id: b.datapack_id, agent_id: AGENT_ID,
    limit: Math.min(30, limit * 2), ...(b.dedicated ? {} : { run_id: b.conversation_id }),
  });
  return (r?.results || []).filter((m) => belongs(m, b)).slice(0, limit)
    .map((m) => ({ id: m.id, text: m.memory ?? m.data ?? '', score: m.score ?? null, date: String(m.created_at || '').slice(0, 10) }));
}

// ---- Family sharing ------------------------------------------------------------------
async function sharingMembers(familyId) {
  const { rows } = await db.query(
    `SELECT s.user_id, u.name FROM memory_shares s JOIN users u ON u.id = s.user_id
     JOIN family_members m ON m.family_id = s.family_id AND m.user_id = s.user_id AND m.status = 'active'
     WHERE s.family_id = $1`, [familyId]);
  return rows;
}

async function sharingStatus(familyId, userId) {
  const members = await sharingMembers(familyId);
  return { sharing: members.some((m) => m.user_id === userId), sharedBy: members.map((m) => ({ userId: m.user_id, name: m.name })) };
}

async function setSharing(familyId, userId, share, ip) {
  if (share) await db.query('INSERT INTO memory_shares (family_id, user_id) VALUES ($1,$2) ON CONFLICT DO NOTHING', [familyId, userId]);
  else await db.query('DELETE FROM memory_shares WHERE family_id = $1 AND user_id = $2', [familyId, userId]);
  await audit({ familyId, actorId: userId, action: share ? 'memory.share' : 'memory.unshare', ip });
  return sharingStatus(familyId, userId);
}

/**
 * Memory search for a chat. scope 'me': the viewer's memory only. scope 'family':
 * the viewer plus every member of the family who shares with it.
 */
async function search(viewerId, query, { scope = 'me', familyId = null, limit = 6 } = {}) {
  if (!meko.isEnabled()) return { source: 'disabled', memories: [] };
  const people = [{ user_id: viewerId, name: 'you' }];
  if (scope === 'family' && familyId) for (const m of await sharingMembers(familyId)) if (m.user_id !== viewerId) people.push(m);
  const out = [];
  for (const p of people) {
    try {
      for (const m of await searchPerson(p.user_id, query, limit)) out.push({ ...m, person: p.user_id === viewerId ? 'you' : p.name });
    } catch (err) {
      out.push({ person: p.name, error: `Memory unavailable: ${err.message}` });
    }
  }
  out.sort((a, b) => (b.score ?? 0) - (a.score ?? 0));
  return { source: 'meko', memories: out.slice(0, limit * Math.min(3, people.length)) };
}

// ---- Deletion --------------------------------------------------------------------------
/** Account deletion / demo reset: removes the person's memories, documents and storage. */
async function deleteAllForUser(userId) {
  const b = await binding(userId, { create: false });
  if (!b) return { ok: true, deleted: 0 };
  if (!meko.isEnabled()) return { ok: false, required: true, error: 'Meko is disabled, so stored memories cannot be deleted yet' };
  try {
    if (b.dedicated) {
      await meko.callTool('datapack_delete', { datapack_id: b.datapack_id, conversation_id: await controlConversationId() });
    } else {
      const { memories } = await list(userId);
      for (const m of memories) await meko.callTool('memory_delete_by_id', { memory_id: m.id, conversation_id: b.conversation_id, datapack_id: b.datapack_id, agent_id: AGENT_ID }).catch(() => {});
      const docs = await db.query('SELECT meko_document_id FROM documents WHERE user_id = $1 AND meko_document_id IS NOT NULL AND deleted_at IS NULL', [userId]);
      for (const d of docs.rows) await meko.callTool('knowledgebase_delete_document', { document_id: d.meko_document_id, conversation_id: b.conversation_id, datapack_id: b.datapack_id }).catch(() => {});
      await meko.callTool('conversation_delete', { conversation_id: b.conversation_id, datapack_id: b.datapack_id, agent_id: AGENT_ID }).catch(() => {});
    }
  } catch (err) {
    return { ok: false, required: true, error: err.message };
  }
  await db.query("DELETE FROM meko_bindings WHERE scope_type = 'user' AND scope_id = $1", [userId]);
  await db.query('UPDATE documents SET deleted_at = now() WHERE user_id = $1 AND deleted_at IS NULL', [userId]);
  return { ok: true };
}

module.exports = { binding, recordChatTurn, recordActivity, list, forget, search, searchPerson, sharingStatus, setSharing, sharingMembers, deleteAllForUser, hasConsent, AGENT_ID, plain, _newId: randomUUID };
