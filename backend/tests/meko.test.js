// Meko context: isolation, sanitisation, correction, deletion and outage behaviour,
// against an MCP test double that follows Meko's documented semantics.
const test = require('node:test');
const assert = require('node:assert/strict');
const { createFakeMeko } = require('./helpers/fakeMeko');

const fake = createFakeMeko();
let call; let newUser; let api;
let asha; let ravi; let fid;

test.before(async () => {
  const url = await fake.start();
  Object.assign(process.env, { MEKO_ENABLED: 'true', MEKO_ISOLATION: 'datapack', MEKO_MCP_URL: url, MEKO_API_KEY: fake.apiKey, MEKO_DATAPACK_PREFIX: `lostest${Date.now()}` });
  api = require('./helpers/api');
  ({ call, newUser } = api);
  await api.start();
  [asha, ravi] = await Promise.all([newUser('asha'), newUser('ravi')]);
  fid = (await call('POST', '/api/families', { token: asha.token, body: { name: 'Context Family' } })).body.family.id;
  const inv = await call('POST', `/api/families/${fid}/invitations`, { token: asha.token, body: { email: ravi.email, role: 'member' } });
  await call('POST', '/api/families/invitations/accept', { token: ravi.token, body: { token: inv.body.invitation.token } });
});
test.after(async () => { await require('../services/meko/client').reset(); await api.stop(); await fake.stop(); });

const ctx = (u, method, path = '', body) => call(method, `/api/families/${fid}/context${path}`, { token: u.token, body });

test('sanitiser removes identifiers and secrets', () => {
  const { sanitise } = require('../services/meko/contextService');
  const r = sanitise('A/c 123456789012 IFSC HDFC0001234 PAN ABCDE1234F card 4111 1111 1111 1111 mail a@b.com call 9876543210 key mko_abcdefghijklmnop');
  for (const bad of ['123456789012', 'HDFC0001234', 'ABCDE1234F', '4111', 'a@b.com', '9876543210', 'mko_abc']) assert.ok(!r.text.includes(bad), bad);
  assert.ok(r.redactions.length >= 6);
});

test('saving context requires consent', async () => {
  const r = await ctx(asha, 'POST', '', { kind: 'goal', title: 'Emergency fund', body: 'Keep six months of expenses in savings.' });
  assert.equal(r.status, 403);
  assert.equal(r.body.error, 'CONSENT_REQUIRED');
  for (const u of [asha, ravi]) await call('POST', '/api/me/consents', { token: u.token, body: { scope: 'meko_context', granted: true } });
});

let sharedId; let ashaPrivateId; let raviPrivateId;
test('shared and private memories go to separate datapacks', async () => {
  const s = await ctx(asha, 'POST', '', { kind: 'goal', title: 'Emergency fund target', body: 'Family goal: keep six months of essential expenses in liquid savings. Account 123456789012.' });
  assert.equal(s.status, 201, JSON.stringify(s.body));
  assert.equal(s.body.sync.status, 'synced');
  assert.ok(s.body.redactions.some((x) => ['account_number', 'aadhaar'].includes(x)));
  assert.ok(!s.body.memory.body.includes('123456789012'));
  sharedId = s.body.memory.id;
  ashaPrivateId = (await ctx(asha, 'POST', '', { kind: 'preference', title: 'Asha risk note', body: 'Private: Asha prefers to avoid small-cap stocks entirely.', private: true })).body.memory.id;
  raviPrivateId = (await ctx(ravi, 'POST', '', { kind: 'preference', title: 'Ravi risk note', body: 'Private: Ravi is comfortable with small-cap stocks up to 10%.', private: true })).body.memory.id;

  const dps = [...fake.state.datapacks.values()];
  assert.equal(dps.length, 4); // account default + family + two users
  const familyDp = dps.find((d) => d.name.includes('-family-'));
  assert.equal(familyDp.memories.size, 1);
});

test("search returns shared + own private context only, never another member's", async () => {
  const r = await ctx(ravi, 'GET', '/search?q=small-cap stocks risk six months');
  assert.equal(r.status, 200);
  assert.equal(r.body.source, 'meko');
  const ids = r.body.results.map((m) => m.id);
  assert.ok(ids.includes(raviPrivateId));
  assert.ok(!ids.includes(ashaPrivateId));
  const list = await ctx(ravi, 'GET');
  assert.ok(!list.body.memories.some((m) => m.id === ashaPrivateId));
});

test('memories in Meko that FinSight did not write are never returned', async () => {
  const familyDp = [...fake.state.datapacks.values()].find((d) => d.name.includes('-family-'));
  fake.inject(familyDp.id, 'Injected: emergency fund six months small-cap secret');
  const r = await ctx(ravi, 'GET', '/search?q=emergency fund six months');
  assert.ok(r.body.results.every((m) => m.id && !String(m.matchedText || '').startsWith('Injected')));
  assert.ok(r.body.results.some((m) => m.id === sharedId));
});

test('only the author or an admin can change shared context; others get 403/404', async () => {
  assert.equal((await ctx(ravi, 'DELETE', `/${sharedId}`)).status, 403);
  assert.equal((await ctx(ravi, 'DELETE', `/${ashaPrivateId}`)).status, 404);
});

test('corrections supersede the old memory in Meko and the index', async () => {
  const before = [...fake.state.datapacks.values()].find((d) => d.name.includes('-family-')).memories.size;
  const r = await ctx(asha, 'PATCH', `/${sharedId}`, { body: 'Family goal: keep nine months of essential expenses in liquid savings.' });
  assert.equal(r.status, 200, JSON.stringify(r.body));
  const fam = [...fake.state.datapacks.values()].find((d) => d.name.includes('-family-'));
  assert.equal(fam.memories.size, before); // one removed, one added
  const list = await ctx(asha, 'GET');
  assert.ok(!list.body.memories.some((m) => m.id === sharedId));
  sharedId = r.body.memory.id;
  assert.ok(list.body.memories.some((m) => m.id === sharedId && m.body.includes('nine months')));
});

test('delete removes the memory from Meko', async () => {
  const fam = [...fake.state.datapacks.values()].find((d) => d.name.includes('-family-'));
  const before = fam.memories.size;
  assert.equal((await ctx(asha, 'DELETE', `/${sharedId}`)).status, 200);
  assert.equal(fam.memories.size, before - 1);
});

test('Meko outage: saving still works locally, search degrades, resync recovers', async () => {
  const realUrl = process.env.MEKO_MCP_URL;
  process.env.MEKO_MCP_URL = 'http://127.0.0.1:1/mcp';
  await require('../services/meko/client').reset();
  const r = await ctx(asha, 'POST', '', { kind: 'decision', title: 'Postponed car purchase', body: 'We postponed the car purchase until the emergency fund is rebuilt.' });
  assert.equal(r.status, 201);
  assert.equal(r.body.sync.status, 'failed');
  const s = await ctx(asha, 'GET', '/search?q=car purchase');
  assert.equal(s.body.source, 'local_index');
  assert.ok(s.body.degraded);
  assert.ok(s.body.results.some((m) => m.id === r.body.memory.id));
  // Core finance keeps working during the outage.
  assert.equal((await call('GET', `/api/families/${fid}/dashboard`, { token: asha.token })).status, 200);

  process.env.MEKO_MCP_URL = realUrl;
  await require('../services/meko/client').reset();
  const rs = await ctx(asha, 'POST', '/resync');
  assert.ok(rs.body.results.some((x) => x.id === r.body.memory.id && x.status === 'synced'));
});

test('account deletion removes the private datapack', async () => {
  const before = fake.state.datapacks.size;
  const del = await call('POST', '/api/me/delete', { token: ravi.token, body: { password: 'correct-horse-9', confirm: 'DELETE' } });
  assert.equal(del.status, 200, JSON.stringify(del.body));
  assert.equal(del.body.meko.datapackDeleted, true);
  assert.equal(fake.state.datapacks.size, before - 1);
});

test('context sources reject javascript: and other non-http links', async () => {
  const r = await ctx(asha, 'POST', '', { kind: 'note', title: 'XSS attempt', body: 'This should not be stored with a script link.', sources: [{ label: 'x', url: 'javascript:alert(1)' }] });
  assert.equal(r.status, 400);
});

test('a stale control conversation (e.g. Meko account switched) is replaced automatically', async () => {
  const db = require('../db/pool');
  await db.query("UPDATE meko_settings SET value = 'stale-conversation-id' WHERE key = 'control_conversation_id'");
  require('../services/meko/contextService').resetControlCache();
  const before = fake.state.conversations.size;
  // A new family needs a new datapack, which needs the control conversation.
  const f = await call('POST', '/api/families', { token: asha.token, body: { name: 'Second Family' } });
  const r = await call('POST', `/api/families/${f.body.family.id}/context`, { token: asha.token, body: { kind: 'note', title: 'Fresh family note', body: 'This needs a brand new datapack in Meko.' } });
  assert.equal(r.status, 201, JSON.stringify(r.body));
  assert.equal(r.body.sync.status, 'synced', JSON.stringify(r.body.sync));
  const { rows } = await db.query("SELECT value FROM meko_settings WHERE key = 'control_conversation_id'");
  assert.notEqual(rows[0].value, 'stale-conversation-id');
  assert.ok(fake.state.conversations.size > before);
});
