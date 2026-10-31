// Person memory: Meko builds memory from chat turns and app activity; users can view
// and forget but never write it; family sharing; documents in the knowledge base.
const test = require('node:test');
const assert = require('node:assert/strict');
const { createFakeMeko } = require('./helpers/fakeMeko');

const fake = createFakeMeko();
let call; let api; let a; let b; let c; let famA; let famC; let script = [];

test.before(async () => {
  const url = await fake.start();
  Object.assign(process.env, { MEKO_ENABLED: 'true', MEKO_MCP_URL: url, MEKO_API_KEY: fake.apiKey, MEKO_DATAPACK_PREFIX: `pm${Date.now()}` });
  process.env.MEKO_DATAPACK_ID = ''; // empty, not deleted: dotenv would reload the developer's value
  api = require('./helpers/api');
  ({ call } = api);
  await api.start();
  const llm = require('../lib/llm');
  llm.isConfigured = () => true;
  llm.generateJson = async () => ({ provider: 'stub', model: 'stub', json: script.shift() || { answer: 'ok' } });
  [a, b, c] = await Promise.all([api.newUser('pa'), api.newUser('pb'), api.newUser('pc')]);
  famA = (await call('POST', '/api/families', { token: a.token, body: { name: 'Family A' } })).body.family.id;
  famC = (await call('POST', '/api/families', { token: c.token, body: { name: 'Family C' } })).body.family.id;
  const inv = await call('POST', `/api/families/${famA}/invitations`, { token: a.token, body: { email: b.email, role: 'member' } });
  await call('POST', '/api/families/invitations/accept', { token: b.token, body: { token: inv.body.invitation.token } });
  for (const u of [a, b, c]) {
    await call('POST', '/api/me/consents', { token: u.token, body: { scope: 'meko_context', granted: true } });
    await call('POST', '/api/me/consents', { token: u.token, body: { scope: 'ai_analysis', granted: true } });
  }
});
test.after(async () => { await require('../services/meko/client').reset(); await api.stop(); await fake.stop(); });

const chat = (u, fid, text, scope = 'me') => call('POST', `/api/families/${fid}/assistant/chat`, { token: u.token, body: { scope, messages: [{ role: 'user', content: text }] } });
const memory = (u) => call('GET', '/api/me/memory', { token: u.token });

test('there is no way to write memory directly', async () => {
  const r = await call('POST', `/api/families/${famA}/context`, { token: a.token, body: { kind: 'note', title: 'x', body: 'manually written memory' } });
  assert.equal(r.status, 404);
});

test('a chat turn becomes memory in that person\'s own datapack', async () => {
  script = [{ answer: 'Noted, no crypto.' }];
  const r = await chat(a, famA, 'I never invest in crypto and keep a 6 month emergency fund.');
  assert.equal(r.status, 200, JSON.stringify(r.body));
  const m = await memory(a);
  assert.equal(m.body.storage, 'own datapack');
  assert.equal(m.body.memories.length, 1);
  assert.match(m.body.memories[0].text, /never invest in crypto/);
  assert.equal((await memory(b)).body.memories.length, 0, 'B sees nothing of A');
});

test('app activity is remembered too (stress test)', async () => {
  await call('POST', `/api/families/${famA}/accounts`, { token: b.token, body: { name: 'B savings', kind: 'savings', value: 200000, owners: [{ userId: b.id, sharePct: 100 }] } });
  const r = await call('POST', `/api/families/${famA}/stress/run`, { token: b.token, body: { shocks: [{ type: 'income_change', changePct: -100, months: 3 }] } });
  assert.equal(r.status, 200, JSON.stringify(r.body));
  const m = await memory(b);
  assert.ok(m.body.memories.some((x) => /stress test/.test(x.text)), JSON.stringify(m.body));
});

test('users can forget a memory but only their own', async () => {
  const mine = (await memory(a)).body.memories[0];
  assert.equal((await call('DELETE', `/api/me/memory/${mine.id}`, { token: b.token })).status, 404);
  assert.equal((await call('DELETE', `/api/me/memory/${mine.id}`, { token: a.token })).status, 200);
  assert.equal((await memory(a)).body.memories.length, 0);
});

test('family chat reads memory only from members who share', async () => {
  script = [{ answer: 'ok' }];
  await chat(a, famA, 'My daughter goes to college in 2031 and needs 25 lakh.');
  const svc = require('../services/meko/personMemory');
  let r = await svc.search(b.id, 'college 2031 lakh', { scope: 'family', familyId: famA });
  assert.ok(!r.memories.some((m) => /college/.test(m.text)), 'A is not sharing yet');
  assert.equal((await call('PUT', `/api/families/${famA}/memory-sharing`, { token: a.token, body: { share: true } })).body.sharing, true);
  r = await svc.search(b.id, 'college 2031 lakh', { scope: 'family', familyId: famA });
  assert.ok(r.memories.some((m) => /college/.test(m.text) && m.person !== 'you'));
  r = await svc.search(b.id, 'college 2031 lakh', { scope: 'me', familyId: famA });
  assert.ok(!r.memories.some((m) => /college/.test(m.text)), 'personal mode stays personal');
  // Someone outside the family cannot read A's memory via their own family.
  r = await svc.search(c.id, 'college 2031 lakh', { scope: 'family', familyId: famC });
  assert.equal(r.memories.length, 0);
});

test('free-tier fallback: own conversation in a shared datapack, still separate', async () => {
  fake.state.refuseCreate = true;
  const [d, e] = await Promise.all([api.newUser('pd'), api.newUser('pe')]);
  for (const u of [d, e]) await call('POST', '/api/me/consents', { token: u.token, body: { scope: 'meko_context', granted: true } });
  const person = require('../services/meko/personMemory');
  await person.recordChatTurn(d.id, 'D prefers gold over stocks.', 'ok');
  await person.recordChatTurn(e.id, 'E is saving for a house.', 'ok');
  const md = (await memory(d)).body; const me = (await memory(e)).body;
  assert.equal(md.storage, 'own conversation in a shared datapack');
  assert.deepEqual(md.memories.map((x) => x.text), ['User said: D prefers gold over stocks.']);
  assert.deepEqual(me.memories.map((x) => x.text), ['User said: E is saving for a house.']);
  fake.state.refuseCreate = false;
});

test('documents go to the knowledge base, are searchable by their owner only, and can be deleted', async () => {
  const send = (u, name, text, extra = {}) => {
    const form = new FormData();
    form.append('kind', 'itr'); form.append('consent', 'true');
    for (const [k, v] of Object.entries(extra)) form.set(k, v);
    form.append('file', new Blob([text], { type: 'text/plain' }), name);
    return fetch(`${api.baseUrl()}/api/me/documents`, { method: 'POST', headers: { Authorization: `Bearer ${u.token}`, 'X-LOS-CSRF': '1' }, body: form }).then(async (r) => ({ status: r.status, body: await r.json() }));
  };
  assert.equal((await send(a, 'itr.txt', 'ITR text', { consent: 'false' })).status, 400, 'consent is required');
  script = [{ summary: 'ITR for AY 2026-27', incomes: [{ name: 'Salary', category: 'salary', amount: 1840000, frequency: 'yearly' }], accounts: [], holdings: [], liabilities: [] }];
  const up = await send(a, 'itr.txt', 'Income tax return assessment year 2026-27 gross salary income Rs 18,40,000 deductions 80C 1,50,000');
  assert.equal(up.status, 201, JSON.stringify(up.body));
  assert.equal(up.body.document.analysisStatus, 'done');
  const list = (await call('GET', '/api/me/documents', { token: a.token })).body.documents;
  assert.equal(list[0].status, 'indexed');
  const docs = require('../services/documents');
  assert.match((await docs.searchDocuments(a.id, 'gross salary income'))[0].text, /18,40,000/);
  assert.equal((await docs.searchDocuments(b.id, 'gross salary income')).length, 0);
  // Approving a suggestion adds a record.
  const ap = await call('POST', `/api/me/documents/${list[0].id}/apply`, { token: a.token, body: { familyId: famA, incomes: [0] } });
  assert.equal(ap.body.added.incomes, 1);
  // Delete removes it from Meko.
  assert.equal((await call('DELETE', `/api/me/documents/${list[0].id}`, { token: a.token })).status, 200);
  assert.equal(fake.state.kbDocs.size, 0);
});

test('two actions at the same moment create only one datapack for a person', async () => {
  const f = await api.newUser('pf');
  await call('POST', '/api/me/consents', { token: f.token, body: { scope: 'meko_context', granted: true } });
  const person = require('../services/meko/personMemory');
  const before = fake.state.datapacks.size;
  await Promise.all([person.recordChatTurn(f.id, 'one', 'ok'), person.recordChatTurn(f.id, 'two', 'ok'), person.recordActivity(f.id, 'three')]);
  assert.equal(fake.state.datapacks.size, before + 1);
  const m = (await memory(f)).body;
  assert.equal(m.storage, 'own datapack');
  assert.equal(m.memories.length, 3);
});
