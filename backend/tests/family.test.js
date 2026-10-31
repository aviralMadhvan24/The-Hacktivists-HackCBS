// End-to-end: family creation, invitations, roles, ownership, privacy,
// dashboards, stress tests, proposals, audit and data rights — via the HTTP API.
// The financial records mirror tests/engine.test.js so totals are hand-checked.
const test = require('node:test');
const assert = require('node:assert/strict');
const { start, stop, call, newUser } = require('./helpers/api');

let asha; let ravi; let kiran; let om; let fid; let omFid;
const ids = {};

test.before(async () => {
  await start();
  [asha, ravi, kiran, om] = await Promise.all([newUser('asha'), newUser('ravi'), newUser('kiran'), newUser('om')]);
});
test.after(stop);

const post = (u, p, body) => call('POST', p, { token: u.token, body });
const get = (u, p) => call('GET', p, { token: u.token });

test('create family and invite members with roles', async () => {
  const f = await post(asha, '/api/families', { name: 'Sharma Family' });
  assert.equal(f.status, 201);
  fid = f.body.family.id;
  assert.equal(f.body.family.myRole, 'owner');

  const inv = await post(asha, `/api/families/${fid}/invitations`, { email: ravi.email, role: 'member' });
  assert.equal(inv.status, 201);
  assert.ok(inv.body.invitation.token);
  // Someone else can't use Ravi's invitation token.
  assert.equal((await post(om, '/api/families/invitations/accept', { token: inv.body.invitation.token })).status, 404);
  const acc = await post(ravi, '/api/families/invitations/accept', { token: inv.body.invitation.token });
  assert.equal(acc.status, 200);
  assert.equal((await post(ravi, '/api/families/invitations/accept', { token: inv.body.invitation.token })).status, 409);

  await post(asha, `/api/families/${fid}/invitations`, { email: kiran.email, role: 'viewer' });
  const mine = await get(kiran, '/api/families/invitations/mine');
  assert.equal(mine.body.invitations.length, 1);
  assert.equal((await post(kiran, '/api/families/invitations/accept', { invitationId: mine.body.invitations[0].id })).status, 200);

  const fam = await get(asha, `/api/families/${fid}`);
  assert.deepEqual(fam.body.family.members.map((m) => m.role).sort(), ['member', 'owner', 'viewer']);

  const omFam = await post(om, '/api/families', { name: 'Om Family' });
  omFid = omFam.body.family.id;
});

test('role limits: members cannot invite; viewers cannot create records', async () => {
  assert.equal((await post(ravi, `/api/families/${fid}/invitations`, { email: 'x@example.test', role: 'member' })).status, 403);
  const r = await post(kiran, `/api/families/${fid}/accounts`, { name: 'K', kind: 'cash', value: 1, owners: [{ userId: kiran.id, sharePct: 100 }] });
  assert.equal(r.status, 403);
});

test('non-members get 404 for another family', async () => {
  assert.equal((await get(om, `/api/families/${fid}`)).status, 404);
  assert.equal((await get(om, `/api/families/${fid}/dashboard`)).status, 404);
  assert.equal((await get(asha, `/api/families/${omFid}/accounts`)).status, 404);
});

test('enter individual, joint and private records', async () => {
  const A = asha.id; const R = ravi.id;
  const mk = async (u, entity, body) => {
    const r = await post(u, `/api/families/${fid}/${entity}`, body);
    assert.equal(r.status, 201, JSON.stringify(r.body));
    return r.body.item.id;
  };
  ids.sav = await mk(asha, 'accounts', { name: 'Joint savings', kind: 'savings', value: 400000, owners: [{ userId: A, sharePct: 50 }, { userId: R, sharePct: 50 }] });
  ids.fd = await mk(asha, 'accounts', { name: 'Asha FD', kind: 'fixed_deposit', value: 200000, visibility: 'private', owners: [{ userId: A, sharePct: 100 }] });
  ids.brk = await mk(ravi, 'accounts', { name: 'Ravi demat', kind: 'brokerage', owners: [{ userId: R, sharePct: 100 }] });
  ids.flat = await mk(asha, 'accounts', { name: 'Flat (50% with brother)', kind: 'real_estate', value: 6000000, owners: [{ userId: A, sharePct: 50 }] });
  ids.mf = await mk(asha, 'accounts', { name: 'Equity MF', kind: 'mutual_fund', value: 100000, owners: [{ userId: A, sharePct: 100 }] });
  for (const h of [
    { symbol: 'RELIANCE', sector: 'Energy', quantity: 100, avgPrice: 900, lastPrice: 1000 },
    { symbol: 'TCS', sector: 'IT', quantity: 50, avgPrice: 1800, lastPrice: 2000 },
    { symbol: 'infy.ns', sector: 'IT', quantity: 100, avgPrice: 1100, lastPrice: 1000 },
  ]) {
    const r = await post(ravi, `/api/families/${fid}/accounts/${ids.brk}/holdings`, h);
    assert.equal(r.status, 201, JSON.stringify(r.body));
  }
  await mk(asha, 'liabilities', { name: 'Home loan', kind: 'home_loan', outstanding: 3000000, emiMonthly: 30000, rateType: 'floating', owners: [{ userId: A, sharePct: 50 }] });
  await mk(ravi, 'liabilities', { name: 'Credit card', kind: 'credit_card', outstanding: 50000, owners: [{ userId: R, sharePct: 100 }] });
  await mk(asha, 'cashflows', { direction: 'income', category: 'salary', name: 'Asha salary', amount: 120000, owners: [{ userId: A, sharePct: 100 }] });
  ids.raviSalary = await mk(ravi, 'cashflows', { direction: 'income', category: 'salary', name: 'Ravi salary', amount: 60000, owners: [{ userId: R, sharePct: 100 }] });
  await mk(asha, 'cashflows', { direction: 'expense', category: 'household', name: 'Household', amount: 70000, owners: [{ userId: A, sharePct: 50 }, { userId: R, sharePct: 50 }] });
  await mk(asha, 'cashflows', { direction: 'expense', category: 'lifestyle', name: 'Lifestyle', amount: 20000, essential: false, owners: [{ userId: A, sharePct: 50 }, { userId: R, sharePct: 50 }] });
  await mk(asha, 'cashflows', { direction: 'expense', category: 'insurance', name: 'Insurance', amount: 24000, frequency: 'yearly', owners: [{ userId: A, sharePct: 100 }] });
});

test('record validation and ownership rules', async () => {
  const base = { name: 'X', kind: 'cash', value: 10 };
  assert.equal((await post(asha, `/api/families/${fid}/accounts`, { ...base, owners: [{ userId: asha.id, sharePct: 70 }, { userId: ravi.id, sharePct: 40 }] })).status, 400);
  assert.equal((await post(asha, `/api/families/${fid}/accounts`, { ...base, visibility: 'private', owners: [{ userId: ravi.id, sharePct: 100 }] })).status, 400);
  assert.equal((await post(ravi, `/api/families/${fid}/accounts`, { ...base, owners: [{ userId: asha.id, sharePct: 100 }] })).status, 403);
  assert.equal((await post(asha, `/api/families/${fid}/accounts`, { ...base, owners: [{ userId: om.id, sharePct: 100 }] })).status, 400);
  assert.equal((await post(asha, `/api/families/${fid}/accounts`, { ...base, value: -5, owners: [{ userId: asha.id, sharePct: 100 }] })).status, 400);
});

test('owner dashboard: consolidated totals match hand calculation', async () => {
  const d = await get(asha, `/api/families/${fid}/dashboard`);
  assert.equal(d.status, 200, JSON.stringify(d.body));
  const p = d.body.position;
  assert.equal(p.assets.total, 4000000);
  assert.equal(p.assets.liquid, 400000);
  assert.equal(p.liabilities.total, 1550000);
  assert.equal(p.netWorth, 2450000);
  assert.equal(p.cashflow.monthlyOutflows, 107000);
  assert.equal(p.runway.ifIncomeStopsMonths, 3.74);
  assert.ok(Math.abs(d.body.score.score - 82.4) <= 0.11, `score ${d.body.score.score}`);
  assert.equal(d.body.score.pillars.length, 5);
});

test("privacy: members never see another member's private records", async () => {
  const d = await get(ravi, `/api/families/${fid}/dashboard`);
  assert.equal(d.body.position.assets.total, 3800000); // without Asha's private ₹2L FD
  assert.equal(d.body.position.netWorth, 2250000);
  const list = await get(ravi, `/api/families/${fid}/accounts`);
  assert.ok(!list.body.accounts.some((a) => a.id === ids.fd));
  assert.equal((await get(ravi, `/api/families/${fid}/accounts/${ids.fd}`)).status, 404);
  assert.equal((await call('PATCH', `/api/families/${fid}/accounts/${ids.fd}`, { token: ravi.token, body: { value: 1 } })).status, 404);
  assert.equal((await get(kiran, `/api/families/${fid}/accounts/${ids.fd}`)).status, 404);
});

test('individual views add up to the family view (no double counting)', async () => {
  const a = await get(asha, `/api/families/${fid}/dashboard?scope=individual`);
  const r = await get(asha, `/api/families/${fid}/dashboard?scope=individual&userId=${ravi.id}`);
  assert.equal(a.body.position.netWorth, 2000000);
  assert.equal(r.body.position.netWorth, 450000);
});

test('edit permissions: co-owners and admins only', async () => {
  // Ravi co-owns the joint savings → can edit. Kiran (viewer) cannot.
  assert.equal((await call('PATCH', `/api/families/${fid}/accounts/${ids.sav}`, { token: ravi.token, body: { value: 450000 } })).status, 200);
  assert.equal((await call('PATCH', `/api/families/${fid}/accounts/${ids.sav}`, { token: kiran.token, body: { value: 1 } })).status, 403);
  // Ravi does not own the flat → cannot edit.
  assert.equal((await call('PATCH', `/api/families/${fid}/accounts/${ids.flat}`, { token: ravi.token, body: { value: 1 } })).status, 403);
  await call('PATCH', `/api/families/${fid}/accounts/${ids.sav}`, { token: asha.token, body: { value: 400000 } });
});

test('score change is explained after a balance change', async () => {
  await call('PATCH', `/api/families/${fid}/accounts/${ids.sav}`, { token: asha.token, body: { value: 600000 } });
  const d = await get(asha, `/api/families/${fid}/dashboard`);
  assert.ok(d.body.scoreChange.delta > 0);
  assert.equal(d.body.scoreChange.changes[0].pillar, 'emergency');
  await call('PATCH', `/api/families/${fid}/accounts/${ids.sav}`, { token: asha.token, body: { value: 400000 } });
  const h = await get(asha, `/api/families/${fid}/score/history`);
  assert.ok(h.body.history.length >= 2);
});

test('stress: combined scenario, compare, reverse and saved runs', async () => {
  const run = await post(asha, `/api/families/${fid}/stress/run`, {
    shocks: [{ type: 'market', declinePct: 20 }, { type: 'one_time_expense', amount: 100000, month: 0 }, { type: 'income_change', changePct: -100, months: 6 }],
    saveAs: 'Crash + job loss + medical',
  });
  assert.equal(run.status, 200, JSON.stringify(run.body));
  assert.equal(run.body.result.impact.forcedSales, 342000);
  assert.ok(run.body.result.savedId);

  const bad = await post(asha, `/api/families/${fid}/stress/run`, { shocks: [{ type: 'market', declinePct: 150 }] });
  assert.equal(bad.status, 400);

  const presets = await get(asha, `/api/families/${fid}/stress/presets`);
  const cmp = await post(asha, `/api/families/${fid}/stress/compare`, { scenarios: presets.body.presets.slice(0, 4).map(({ name, shocks }) => ({ name, shocks })) });
  assert.equal(cmp.body.scenarios.length, 4);

  const rev = await post(asha, `/api/families/${fid}/stress/reverse`, { variable: 'income_loss_months', condition: { type: 'forced_selling' } });
  assert.equal(rev.body.result.threshold, 4);

  const sims = await get(asha, `/api/families/${fid}/simulations`);
  assert.equal(sims.body.simulations.length, 1);
  assert.equal((await get(ravi, `/api/families/${fid}/simulations/${run.body.result.savedId}`)).status, 404);
});

test('proposals: propose, discuss, vote and decide', async () => {
  const p = await post(ravi, `/api/families/${fid}/proposals`, { kind: 'buy_stock', title: 'Buy HDFC Bank', amount: 50000, decision: { symbol: 'HDFCBANK', sector: 'Financials' } });
  assert.equal(p.status, 201, JSON.stringify(p.body));
  const pid = p.body.proposal.id;
  assert.ok(p.body.proposal.impact.before, 'proposer sees full impact');

  const seen = await get(asha, `/api/families/${fid}/proposals/${pid}`);
  assert.equal(seen.body.proposal.impact.redacted, true);
  assert.equal(seen.body.proposal.impact.before, undefined);
  const mineImpact = await get(asha, `/api/families/${fid}/proposals/${pid}/impact`);
  assert.equal(mineImpact.body.impact.before.netWorth, 2450000);
  assert.equal(mineImpact.body.impact.after.liquid, 350000);

  assert.equal((await post(kiran, `/api/families/${fid}/proposals/${pid}/comments`, { body: 'Is this too much IT/banking?' })).status, 201);
  assert.equal((await post(kiran, `/api/families/${fid}/proposals/${pid}/vote`, { vote: 'approve' })).status, 403);
  assert.equal((await post(ravi, `/api/families/${fid}/proposals/${pid}/vote`, { vote: 'approve' })).status, 403);
  const v = await post(asha, `/api/families/${fid}/proposals/${pid}/vote`, { vote: 'approve', note: 'OK, small amount' });
  assert.equal(v.body.proposal.status, 'approved');
  assert.equal((await post(asha, `/api/families/${fid}/proposals/${pid}/vote`, { vote: 'reject' })).status, 409);
  const list = await get(kiran, `/api/families/${fid}/proposals`);
  assert.equal(list.body.proposals[0].comments, 1);
});

test('audit log is admin-only and records actions', async () => {
  assert.equal((await get(ravi, `/api/families/${fid}/audit`)).status, 403);
  const a = await get(asha, `/api/families/${fid}/audit`);
  const actions = new Set(a.body.entries.map((e) => e.action));
  for (const x of ['family.create', 'family.join', 'account.create', 'proposal.vote']) assert.ok(actions.has(x), x);
});

test('role changes and member removal', async () => {
  assert.equal((await call('PATCH', `/api/families/${fid}/members/${kiran.id}`, { token: ravi.token, body: { role: 'member' } })).status, 403);
  assert.equal((await call('PATCH', `/api/families/${fid}/members/${kiran.id}`, { token: asha.token, body: { role: 'member' } })).status, 200);
  assert.equal((await call('DELETE', `/api/families/${fid}/members/${asha.id}`, { token: asha.token })).status, 403); // owner can't leave
  assert.equal((await call('DELETE', `/api/families/${fid}/members/${kiran.id}`, { token: kiran.token })).status, 200); // leave
  assert.equal((await get(kiran, `/api/families/${fid}`)).status, 404);
});

test('data export and account deletion', async () => {
  const exp = await get(ravi, '/api/me/export');
  assert.equal(exp.status, 200);
  assert.ok(exp.body.accounts.some((a) => a.name === 'Ravi demat'));
  assert.ok(!exp.body.accounts.some((a) => a.name === 'Asha FD'));

  const blocked = await post(asha, '/api/me/delete', { password: 'correct-horse-9', confirm: 'DELETE' });
  assert.equal(blocked.status, 409); // owns a family with members
  assert.equal((await post(ravi, '/api/me/delete', { password: 'wrong', confirm: 'DELETE' })).status, 401);
  const del = await post(ravi, '/api/me/delete', { password: 'correct-horse-9', confirm: 'DELETE' });
  assert.equal(del.status, 200);
  assert.equal((await get(ravi, '/api/auth/me')).status, 401);
  // Ravi's sole-owned records are gone; joint savings remain at Asha's 50%.
  const d = await get(asha, `/api/families/${fid}/dashboard`);
  assert.equal(d.body.position.assets.liquid, 200000);
  assert.ok(!(await get(asha, `/api/families/${fid}/accounts`)).body.accounts.some((a) => a.id === ids.brk));
});
