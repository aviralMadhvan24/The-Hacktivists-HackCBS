// Simulated Zerodha connection: connect, sync into a family, labelled as simulated, disconnect removes it.
const test = require('node:test');
const assert = require('node:assert/strict');
process.env.MARKET_DATA_PROVIDER = 'MOCK'; // no network: simulated holdings fall back to their average price
const { start, stop, call, newUser } = require('./helpers/api');

let u; let fid;
test.before(async () => {
  await start();
  u = await newUser('zsim');
  fid = (await call('POST', '/api/families', { token: u.token, body: { name: 'Sim Family' } })).body.family.id;
});
test.after(stop);

test('simulated connection is available without Kite credentials and labelled', async () => {
  const s0 = await call('GET', '/api/zerodha/status', { token: u.token });
  assert.equal(s0.body.isConfigured, false);
  assert.equal(s0.body.simulationAvailable, true);
  const c = await call('POST', '/api/zerodha/simulate/connect', { token: u.token, body: {} });
  assert.equal(c.status, 200, JSON.stringify(c.body));
  assert.equal(c.body.isConnected, true);
  assert.equal(c.body.simulated, true);
  assert.match(c.body.connection.brokerUserId, /^DEMO[0-9A-F]{4}$/);
  assert.match(c.body.note, /Simulated/);
});

test('sync creates a simulated account with sectors; disconnect removes it', async () => {
  const sy = await call('POST', '/api/zerodha/sync', { token: u.token, body: { familyId: fid, visibility: 'family' } });
  assert.equal(sy.status, 200, JSON.stringify(sy.body));
  assert.equal(sy.body.simulated, true);
  assert.ok(sy.body.holdingsSynced >= 3);
  const accts = (await call('GET', `/api/families/${fid}/accounts`, { token: u.token })).body;
  const list = accts.items || accts.accounts || [];
  const acct = list.find((a) => a.institution === 'Zerodha');
  assert.ok(acct, 'simulated account exists');
  assert.match(acct.name, /, simulated\)$/);
  const hs = (await call('GET', `/api/families/${fid}/accounts/${acct.id}/holdings`, { token: u.token })).body.holdings;
  assert.ok(hs.every((h) => h.source === 'zerodha' && /simulated/.test(h.priceSource) && h.sector));

  const d = await call('POST', '/api/zerodha/disconnect', { token: u.token, body: {} });
  assert.equal(d.status, 200);
  const after = (await call('GET', `/api/families/${fid}/accounts`, { token: u.token })).body;
  assert.ok(!(after.items || after.accounts || []).some((a) => a.id === acct.id), 'simulated account removed');
  const s = await call('GET', '/api/zerodha/status', { token: u.token });
  assert.equal(s.body.isConnected, false);
});

test('simulation can be disabled', async () => {
  process.env.ZERODHA_SIMULATION = 'false';
  const c = await call('POST', '/api/zerodha/simulate/connect', { token: u.token, body: {} });
  delete process.env.ZERODHA_SIMULATION;
  assert.equal(c.status, 403);
});
