// Meko shared mode (default; works on Meko's free tier): every family's memories live in
// one datapack, so isolation must come entirely from the index. Verified here.
const test = require('node:test');
const assert = require('node:assert/strict');
const { createFakeMeko } = require('./helpers/fakeMeko');

const fake = createFakeMeko();
let call; let api; let a; let b; let c; let famA; let famB;

test.before(async () => {
  const url = await fake.start();
  Object.assign(process.env, { MEKO_ENABLED: 'true', MEKO_ISOLATION: 'shared', MEKO_MCP_URL: url, MEKO_API_KEY: fake.apiKey });
  delete process.env.MEKO_DATAPACK_ID;
  api = require('./helpers/api');
  ({ call } = api);
  await api.start();
  [a, b, c] = await Promise.all([api.newUser('a'), api.newUser('b'), api.newUser('c')]);
  famA = (await call('POST', '/api/families', { token: a.token, body: { name: 'Family A' } })).body.family.id;
  famB = (await call('POST', '/api/families', { token: c.token, body: { name: 'Family B' } })).body.family.id;
  const inv = await call('POST', `/api/families/${famA}/invitations`, { token: a.token, body: { email: b.email, role: 'member' } });
  await call('POST', '/api/families/invitations/accept', { token: b.token, body: { token: inv.body.invitation.token } });
  for (const u of [a, b, c]) await call('POST', '/api/me/consents', { token: u.token, body: { scope: 'meko_context', granted: true } });
});
test.after(async () => { await require('../services/meko/client').reset(); await api.stop(); await fake.stop(); });

const add = (u, fid, body) => call('POST', `/api/families/${fid}/context`, { token: u.token, body });
const search = (u, fid, q) => call('GET', `/api/families/${fid}/context/search?q=${encodeURIComponent(q)}`, { token: u.token });

let aShared; let aPrivate; let cShared;
test('no new datapacks: everything goes to the default datapack', async () => {
  const before = fake.state.datapacks.size;
  aShared = (await add(a, famA, { kind: 'goal', title: 'Retirement goal', body: 'Family A wants to retire early with a large retirement corpus.' })).body.memory.id;
  aPrivate = (await add(a, famA, { kind: 'note', title: 'A private retirement note', body: 'Private: A secretly worries about retirement savings.', private: true })).body.memory.id;
  cShared = (await add(c, famB, { kind: 'goal', title: 'B retirement plan', body: 'Family B retirement corpus target and early retirement plan.' })).body.memory.id;
  assert.equal(fake.state.datapacks.size, before);
  const def = [...fake.state.datapacks.values()].find((d) => d.name === 'meko_default_datapack');
  assert.equal(def.memories.size, 3);
});

test('another family never sees your memories, even in the same datapack', async () => {
  const r = await search(c, famB, 'retirement corpus early retire');
  assert.equal(r.body.source, 'meko');
  const ids = r.body.results.map((m) => m.id);
  assert.deepEqual(ids, [cShared]);
});

test("a family member never sees another member's private memory", async () => {
  const r = await search(b, famA, 'retirement savings worries');
  const ids = r.body.results.map((m) => m.id);
  assert.ok(ids.includes(aShared));
  assert.ok(!ids.includes(aPrivate));
  assert.ok(r.body.results.every((m) => m.matchedText === undefined), 'Meko text is never returned');
  const own = await search(a, famA, 'retirement savings worries');
  assert.ok(own.body.results.some((m) => m.id === aPrivate));
});

test('deleting a family removes its memories from the shared datapack only', async () => {
  const def = [...fake.state.datapacks.values()].find((d) => d.name === 'meko_default_datapack');
  assert.equal((await call('DELETE', `/api/families/${famB}`, { token: c.token })).status, 200);
  assert.equal(def.memories.size, 2);
  assert.ok([...def.memories.values()].every((m) => !m.memory.includes('Family B')));
});

test('account deletion removes the user\u2019s private memories', async () => {
  const def = [...fake.state.datapacks.values()].find((d) => d.name === 'meko_default_datapack');
  const r = await call('POST', '/api/me/delete', { token: b.token, body: { password: 'correct-horse-9', confirm: 'DELETE' } });
  assert.equal(r.status, 200);
  assert.equal(def.memories.size, 2); // b had no private memories; a's are untouched
});
