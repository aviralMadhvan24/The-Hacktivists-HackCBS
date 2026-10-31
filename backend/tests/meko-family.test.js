// Meko family mode: one datapack per family, one conversation per member.
// The first family reuses MEKO_DATAPACK_ID; later families get their own datapack.
const test = require('node:test');
const assert = require('node:assert/strict');
const { createFakeMeko } = require('./helpers/fakeMeko');

const fake = createFakeMeko();
let call; let api; let a; let b; let c; let famA; let famB; let configuredDp;

test.before(async () => {
  const url = await fake.start();
  configuredDp = [...fake.state.datapacks.keys()][0]; // the fake's default datapack stands in for MEKO_DATAPACK_ID
  Object.assign(process.env, { MEKO_ENABLED: 'true', MEKO_ISOLATION: 'family', MEKO_MCP_URL: url, MEKO_API_KEY: fake.apiKey, MEKO_DATAPACK_ID: configuredDp });
  api = require('./helpers/api');
  ({ call } = api);
  await api.start();
  [a, b, c] = await Promise.all([api.newUser('fa'), api.newUser('fb'), api.newUser('fc')]);
  famA = (await call('POST', '/api/families', { token: a.token, body: { name: 'Family A' } })).body.family.id;
  famB = (await call('POST', '/api/families', { token: c.token, body: { name: 'Family B' } })).body.family.id;
  const inv = await call('POST', `/api/families/${famA}/invitations`, { token: a.token, body: { email: b.email, role: 'member' } });
  await call('POST', '/api/families/invitations/accept', { token: b.token, body: { token: inv.body.invitation.token } });
  for (const u of [a, b, c]) await call('POST', '/api/me/consents', { token: u.token, body: { scope: 'meko_context', granted: true } });
});
test.after(async () => {
  process.env.MEKO_DATAPACK_ID = ''; process.env.MEKO_ISOLATION = 'shared';
  await require('../services/meko/client').reset(); await api.stop(); await fake.stop();
});

const add = (u, fid, body) => call('POST', `/api/families/${fid}/context`, { token: u.token, body });
const search = (u, fid, q) => call('GET', `/api/families/${fid}/context/search?q=${encodeURIComponent(q)}`, { token: u.token });

test('first family uses the configured datapack; each member writes to their own conversation', async () => {
  const before = fake.state.datapacks.size;
  const r1 = await add(a, famA, { kind: 'goal', title: 'Retirement goal', body: 'Family A wants to retire early with a large retirement corpus.' });
  const r2 = await add(b, famA, { kind: 'preference', title: 'B retirement view', body: 'Member B prefers index funds for the retirement corpus.' });
  const r3 = await add(b, famA, { kind: 'note', title: 'B private retirement note', body: 'Private: B worries about retirement savings.', private: true });
  for (const r of [r1, r2, r3]) assert.equal(r.body.sync.status, 'synced', JSON.stringify(r.body));
  assert.equal(fake.state.datapacks.size, before, 'no datapack created for the first family');
  const mems = [...fake.state.datapacks.get(configuredDp).memories.values()];
  assert.equal(mems.length, 3);
  const convs = await require('../services/meko/contextService').memberConversations(famA);
  assert.equal(convs.length, 2);
  const convOf = Object.fromEntries(convs.map((x) => [x.userId, x.conversationId]));
  assert.notEqual(convOf[a.id], convOf[b.id]);
  assert.equal(mems.filter((m) => m.conversation_id === convOf[a.id]).length, 1);
  assert.equal(mems.filter((m) => m.conversation_id === convOf[b.id]).length, 2);
  assert.match(fake.state.titles.get(convOf[b.id]), /· Family A$/);
});

test('second family gets its own datapack and cannot see family A', async () => {
  const before = fake.state.datapacks.size;
  const r = await add(c, famB, { kind: 'goal', title: 'B family retirement', body: 'Family B retirement corpus target.' });
  assert.equal(r.body.sync.status, 'synced');
  assert.equal(fake.state.datapacks.size, before + 1);
  const s = await search(c, famB, 'retirement corpus');
  assert.equal(s.body.source, 'meko');
  assert.deepEqual(s.body.results.map((x) => x.title), ['B family retirement']);
});

test("a member sees family memories but not another member's private one", async () => {
  const s = await search(a, famA, 'retirement savings corpus');
  const titles = s.body.results.map((x) => x.title);
  assert.ok(titles.includes('Retirement goal') && titles.includes('B retirement view'));
  assert.ok(!titles.includes('B private retirement note'));
  const sb = await search(b, famA, 'retirement savings');
  assert.ok(sb.body.results.some((x) => x.title === 'B private retirement note'));
});

test('deleting a family keeps the configured datapack but removes its memories and conversations', async () => {
  const svc = require('../services/meko/contextService');
  const convs = await svc.memberConversations(famA);
  const r = await svc.deleteFamilyContext(famA);
  assert.equal(r.ok, true, JSON.stringify(r));
  assert.equal(r.datapackDeleted, false);
  assert.ok(fake.state.datapacks.has(configuredDp));
  assert.equal(fake.state.datapacks.get(configuredDp).memories.size, 0);
  for (const cv of convs) assert.ok(!fake.state.conversations.has(cv.conversationId));
  assert.equal((await svc.memberConversations(famA)).length, 0);
  const r2 = await svc.deleteFamilyContext(famB);
  assert.equal(r2.datapackDeleted, true);
});
