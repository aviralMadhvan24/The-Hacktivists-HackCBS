// Risk statistics (synthetic, hand-checkable series) and the investment agent
// end to end with stubbed market data and LLM, so results are deterministic.
const test = require('node:test');
const assert = require('node:assert/strict');
const { summarize, percentile, maxDrawdown, correlation, beta, rollingReturns } = require('../engine/riskStats');

function series(n, f, start = '2020-01-01') {
  const d0 = new Date(start).getTime();
  return Array.from({ length: n }, (_, i) => ({ date: new Date(d0 + i * 86400000).toISOString().slice(0, 10), adjClose: f(i) }));
}

test('riskStats: percentile, drawdown, rolling returns', () => {
  assert.equal(percentile([1, 2, 3, 4, 5], 50), 3);
  assert.equal(percentile([0, 10], 25), 2.5);
  const bars = [100, 120, 90, 60, 130].map((v, i) => ({ date: `2020-01-0${i + 1}`, adjClose: v }));
  assert.equal(maxDrawdown(bars).maxDrawdownPct, -50); // 120 → 60
  assert.deepEqual(rollingReturns(bars, 2).map((x) => Math.round(x * 100)), [-10, -50, 44]);
});

test('riskStats: beta and correlation of a 2x-levered copy', () => {
  const idx = series(400, (i) => 100 * (1 + 0.01 * Math.sin(i / 3)));
  const idxRets = idx.slice(1).map((b, i) => ({ date: b.date, r: b.adjClose / idx[i].adjClose - 1 }));
  const levered = idxRets.map((x) => ({ date: x.date, r: 2 * x.r }));
  assert.ok(Math.abs(beta(levered, idxRets) - 2) < 1e-9);
  assert.ok(Math.abs(correlation(levered.map((x) => x.r), idxRets.map((x) => x.r)) - 1) < 1e-9);
});

test('riskStats: steady 10%/yr growth has ~0 volatility and ~10% CAGR', () => {
  const bars = series(800, (i) => 100 * 1.1 ** (i / 365.25));
  const s = summarize(bars);
  assert.ok(s.annualizedVolatilityPct < 0.01);
  assert.ok(Math.abs(s.cagrPct - 10) < 0.05);
  assert.equal(s.maxDrawdownPct, 0);
});

// ---- Agent end to end ---------------------------------------------------------------
const { start, stop, call, newUser } = require('./helpers/api');
let u; let fid;

test.before(async () => {
  await start();
  const market = require('../services/marketData');
  const fundamentals = require('../services/marketData/fundamentals');
  const llm = require('../lib/llm');
  const wave = (amp, period) => (i) => 1000 * (1 + 0.0004 * i) * (1 + amp * Math.sin(i / period));
  const fake = { HDFCBANK: wave(0.08, 20), RELIANCE: wave(0.05, 15), '^NSEI': wave(0.04, 20) };
  market.getQuote = async (s) => {
    if (!fake[s]) throw new Error(`Symbol '${s}' not found on NSE.`);
    return { symbol: s, name: `${s} Ltd`, currentPrice: 1500, timestamp: '2026-10-30T10:00:00Z', freshness: 'DELAYED_15MIN', source: 'test' };
  };
  market.getHistory = async (s) => {
    if (!fake[s]) throw new Error('No price history');
    return { symbol: s, bars: series(900, fake[s], '2023-01-01'), source: 'test', fetchedAt: '2026-10-30T10:00:00Z' };
  };
  fundamentals.getFundamentals = async (s) => ({ symbol: s, name: 'HDFC Bank Limited', sector: 'Financial Services', valuation: { trailingPE: 18 }, balanceSheet: { debtToEquity: null }, source: 'test', retrievedAt: 'now' });
  llm.isConfigured = () => true;
  llm.generateJson = async (prompt) => {
    assert.ok(prompt.includes('"symbol":"HDFCBANK"'));
    assert.ok(!/@example\.test/.test(prompt), 'no emails in prompt');
    return { provider: 'stub', model: 'stub-1', json: { summary: 'Fits with caveats.', rationale: ['a'], keyRisks: ['b'], portfolioFit: 'c', alternatives: 'd', uncertainty: 'e', questionsForFamily: ['f'], factsUsed: ['impact.scoreDelta'] } };
  };

  u = await newUser('agent');
  fid = (await call('POST', '/api/families', { token: u.token, body: { name: 'Agent Family' } })).body.family.id;
  const post = (e, b) => call('POST', `/api/families/${fid}/${e}`, { token: u.token, body: { ...b, owners: [{ userId: u.id, sharePct: 100 }] } });
  await post('accounts', { name: 'Savings', kind: 'savings', value: 600000 });
  const brk = (await post('accounts', { name: 'Demat', kind: 'brokerage' })).body.item.id;
  await call('POST', `/api/families/${fid}/accounts/${brk}/holdings`, { token: u.token, body: { symbol: 'RELIANCE', sector: 'Energy', quantity: 200, avgPrice: 1200, lastPrice: 1250 } });
  await post('liabilities', { name: 'Credit card', kind: 'credit_card', outstanding: 40000, interestRatePct: 36 });
  await post('cashflows', { direction: 'income', category: 'salary', name: 'Salary', amount: 120000 });
  await post('cashflows', { direction: 'expense', category: 'household', name: 'Household', amount: 60000 });
});
test.after(stop);

const evaluate = (body) => call('POST', `/api/families/${fid}/agent/evaluate`, { token: u.token, body });

test('agent: deterministic evaluation without AI consent', async () => {
  const r = await evaluate({ symbol: 'hdfcbank', amount: 100000 });
  assert.equal(r.status, 200, JSON.stringify(r.body));
  const e = r.body.evaluation;
  assert.equal(e.narrative.status, 'consent_required');
  assert.equal(e.facts.impact.before.liquid, 600000);
  assert.equal(e.facts.impact.after.liquid, 500000);
  assert.ok(e.facts.history.oneYearReturnRange);
  assert.ok(e.facts.scenarios.some((s) => s.scenario === 'Market falls 30%'));
  assert.ok(e.facts.alternatives.some((a) => a.id === 'prepay'), 'suggests prepaying 36% card debt');
  assert.ok(e.facts.checks.some((c) => c.id === 'expensive_debt'));
  assert.equal(e.facts.correlations[0].symbol, 'RELIANCE');
  assert.ok(['fits', 'minor_concerns', 'caution', 'high_concern'].includes(e.overall));
});

test('agent: AI narrative with consent', async () => {
  await call('POST', '/api/me/consents', { token: u.token, body: { scope: 'ai_analysis', granted: true } });
  const r = await evaluate({ symbol: 'HDFCBANK', amount: 50000 });
  assert.equal(r.body.evaluation.narrative.status, 'ok');
  assert.equal(r.body.evaluation.narrative.summary, 'Fits with caveats.');
  const list = await call('GET', `/api/families/${fid}/agent/evaluations`, { token: u.token });
  assert.equal(list.body.evaluations.length, 2);
});

test('agent: unknown symbol is a 404 and does not use up quota', async () => {
  const r = await evaluate({ symbol: 'NOSUCHCO', amount: 1000 });
  assert.equal(r.status, 404);
  const me = await call('GET', '/api/me', { token: u.token });
  const usage = me.body.entitlements.features.find((f) => f.feature === 'investment_agent');
  assert.equal(usage.used, 2);
});

test('agent: free plan limit is enforced on the backend', async () => {
  assert.equal((await evaluate({ symbol: 'HDFCBANK', amount: 1000 })).status, 200); // 3rd
  const r = await evaluate({ symbol: 'HDFCBANK', amount: 1000 });
  assert.equal(r.status, 402);
  assert.equal(r.body.error, 'USAGE_LIMIT_REACHED');
});

test('fit checks judge what the purchase changes, not pre-existing concentration', () => {
  const { fitChecks } = require('../services/investmentAgent');
  const pos = { cashflow: { essentialOutflows: 70000 }, netWorth: 900000 };
  const mk = (b, a) => ({ after: { liquid: 400000 }, scoreDelta: 0.6, diversification: { before: b, after: a } });
  const levels = (b, a) => Object.fromEntries(fitChecks({ position: pos, impact: mk(b, a), stats: null, fundamentals: null, amount: 1e5, liabilities: [] }).map((c) => [c.id, c.level]));
  assert.equal(levels({ topSector: { sector: 'Energy', weightPct: 52 } }, { topSector: { sector: 'Energy', weightPct: 41 } }).sector_concentration, 'info');
  assert.equal(levels({ topStock: { symbol: 'TCS', weightPct: 15 } }, { topStock: { symbol: 'HDFCBANK', weightPct: 23 } }).stock_concentration, 'high');
  assert.equal(levels({ topSector: { sector: 'IT', weightPct: 30 } }, { topSector: { sector: 'IT', weightPct: 35 } }).sector_concentration, 'medium');
  assert.equal(levels({ topStock: { symbol: 'TCS', weightPct: 8 } }, { topStock: { symbol: 'TCS', weightPct: 9 } }).stock_concentration, undefined);
});
