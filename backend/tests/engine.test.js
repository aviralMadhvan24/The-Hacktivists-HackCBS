// Financial engine tests against hand-computed expectations.
// The worked example is documented step by step in docs/RESILIENCE_SCORE.md.
const test = require('node:test');
const assert = require('node:assert');
const { consolidate, validateOwners } = require('../engine/consolidation');
const { scorePosition, explainChange } = require('../engine/resilience');
const { runScenario, reverseStress, compareScenarios, PRESETS } = require('../engine/stress');
const { piecewise, round2 } = require('../engine/money');

const A = 'user-a'; const B = 'user-b'; const C = 'user-c-outside';
const members = [A, B];
const near = (actual, expected, tol = 0.051, msg) => assert.ok(Math.abs(actual - expected) <= tol, `${msg || ''} expected ≈${expected}, got ${actual}`);

const family = {
  accounts: [
    { id: 'sav', name: 'Joint savings', kind: 'savings', liquidity: 'liquid', value: 400000, valueSource: 'manual', equityPct: 0, owners: [{ userId: A, sharePct: 50 }, { userId: B, sharePct: 50 }] },
    { id: 'fd', name: 'A FD', kind: 'fixed_deposit', liquidity: 'semi_liquid', value: 200000, valueSource: 'manual', equityPct: 0, owners: [{ userId: A, sharePct: 100 }] },
    { id: 'brk', name: 'B demat', kind: 'brokerage', liquidity: 'semi_liquid', value: 0, valueSource: 'holdings', equityPct: 100, owners: [{ userId: B, sharePct: 100 }] },
    { id: 'flat', name: 'Flat', kind: 'real_estate', liquidity: 'illiquid', value: 6000000, valueSource: 'manual', equityPct: 0, owners: [{ userId: A, sharePct: 50 }, { userId: C, sharePct: 50 }] },
    { id: 'mf', name: 'Equity MF', kind: 'mutual_fund', liquidity: 'semi_liquid', value: 100000, valueSource: 'manual', equityPct: 100, owners: [{ userId: A, sharePct: 100 }] },
  ],
  holdings: [
    { accountId: 'brk', symbol: 'RELIANCE', sector: 'Energy', instrument: 'equity', quantity: 100, avgPrice: 900, lastPrice: 1000 },
    { accountId: 'brk', symbol: 'TCS', sector: 'IT', instrument: 'equity', quantity: 50, avgPrice: 1800, lastPrice: 2000 },
    { accountId: 'brk', symbol: 'INFY', sector: 'IT', instrument: 'equity', quantity: 100, avgPrice: 1100, lastPrice: 1000 },
  ],
  liabilities: [
    { id: 'home', name: 'Home loan', kind: 'home_loan', outstanding: 3000000, emiMonthly: 30000, rateType: 'floating', owners: [{ userId: A, sharePct: 50 }, { userId: C, sharePct: 50 }] },
    { id: 'cc', name: 'Credit card', kind: 'credit_card', outstanding: 50000, emiMonthly: 0, rateType: 'fixed', owners: [{ userId: B, sharePct: 100 }] },
  ],
  cashflows: [
    { direction: 'income', category: 'salary', name: 'A salary', amount: 120000, frequency: 'monthly', owners: [{ userId: A, sharePct: 100 }] },
    { direction: 'income', category: 'salary', name: 'B salary', amount: 60000, frequency: 'monthly', owners: [{ userId: B, sharePct: 100 }] },
    { direction: 'expense', category: 'household', name: 'Household', amount: 70000, frequency: 'monthly', essential: true, owners: [{ userId: A, sharePct: 50 }, { userId: B, sharePct: 50 }] },
    { direction: 'expense', category: 'lifestyle', name: 'Lifestyle', amount: 20000, frequency: 'monthly', essential: false, owners: [{ userId: A, sharePct: 50 }, { userId: B, sharePct: 50 }] },
    { direction: 'expense', category: 'insurance', name: 'Insurance', amount: 24000, frequency: 'yearly', essential: true, owners: [{ userId: A, sharePct: 100 }] },
  ],
};

const fam = consolidate(family, { type: 'family' }, members);

test('Consolidation: family totals with outside co-owner excluded', () => {
  assert.strictEqual(fam.assets.total, 4000000);
  assert.strictEqual(fam.assets.liquid, 400000);
  assert.strictEqual(fam.assets.semiLiquid, 600000);
  assert.strictEqual(fam.assets.illiquid, 3000000);
  assert.strictEqual(fam.assets.equityExposure, 400000);
  assert.strictEqual(fam.liabilities.total, 1550000);
  assert.strictEqual(fam.liabilities.monthlyEmi, 15000);
  assert.strictEqual(fam.netWorth, 2450000);
});

test('Consolidation: cash flow, savings rate and runway', () => {
  const cf = fam.cashflow;
  assert.strictEqual(cf.monthlyIncome, 180000);
  assert.strictEqual(cf.essentialExpenses, 72000);
  assert.strictEqual(cf.discretionaryExpenses, 20000);
  assert.strictEqual(cf.monthlyOutflows, 107000);
  assert.strictEqual(cf.essentialOutflows, 87000);
  assert.strictEqual(cf.monthlySavings, 73000);
  assert.strictEqual(cf.savingsRatePct, 40.56);
  assert.strictEqual(fam.runway.state, 'self_sustaining');
  assert.strictEqual(fam.runway.currentBurnMonths, null);
  assert.strictEqual(fam.runway.ifIncomeStopsMonths, 3.74);
  assert.strictEqual(fam.runway.ifIncomeStopsEssentialOnlyMonths, 4.6);
  assert.strictEqual(fam.runway.withSemiLiquidMonths, 9.35);
});

test('Consolidation: individual views sum to the family view (no double counting)', () => {
  const a = consolidate(family, { type: 'individual', userId: A }, members);
  const b = consolidate(family, { type: 'individual', userId: B }, members);
  assert.strictEqual(a.netWorth, 2000000);
  assert.strictEqual(b.netWorth, 450000);
  assert.strictEqual(round2(a.netWorth + b.netWorth), fam.netWorth);
  assert.strictEqual(round2(a.cashflow.monthlyOutflows + b.cashflow.monthlyOutflows), fam.cashflow.monthlyOutflows);
  assert.strictEqual(round2(a.assets.equityExposure + b.assets.equityExposure), fam.assets.equityExposure);
});

test('Consolidation: frequency normalisation and date filtering', () => {
  const data = { accounts: [], holdings: [], liabilities: [], cashflows: [
    { direction: 'expense', amount: 12000, frequency: 'yearly', essential: true, owners: [{ userId: A, sharePct: 100 }] },
    { direction: 'expense', amount: 3000, frequency: 'quarterly', essential: true, owners: [{ userId: A, sharePct: 100 }] },
    { direction: 'expense', amount: 9999, frequency: 'monthly', essential: true, endsOn: '2025-12-31', owners: [{ userId: A, sharePct: 100 }] },
  ] };
  const p = consolidate(data, { type: 'family' }, members, { asOf: '2026-10-31' });
  assert.strictEqual(p.cashflow.essentialExpenses, 2000);
});

test('Ownership validation', () => {
  assert.strictEqual(validateOwners([{ userId: A, sharePct: 60 }, { userId: B, sharePct: 40 }]), null);
  assert.match(validateOwners([{ userId: A, sharePct: 60 }, { userId: B, sharePct: 50 }]), /more than 100/);
  assert.match(validateOwners([]), /At least one owner/);
  assert.match(validateOwners([{ userId: A, sharePct: 0 }]), /between 0 and 100/);
  assert.match(validateOwners([{ userId: A, sharePct: 10 }, { userId: A, sharePct: 10 }]), /twice/);
});

test('Resilience score: five pillars match hand calculation', () => {
  const s = scorePosition(fam);
  const p = Object.fromEntries(s.pillars.map((x) => [x.key, x]));
  near(p.emergency.points, 23.0);           // 5 × (400000 / 87000) = 22.99
  assert.strictEqual(p.cashflow.points, 25); // savings rate 40.6% ≥ 20%
  near(p.debt.points, 13.75, 0.051);         // EMI/income 8.33% → 15 − 1.25
  near(p.diversification.points, 8.1);      // stock 25% → 5; sector IT 50% → 3.11
  near(p.shock.points, 12.6);               // drawdown 4.90% → 15 × (1 − 0.163)
  near(s.score, 82.4, 0.11);
  assert.strictEqual(s.band, 'healthy');
  assert.strictEqual(p.diversification.metrics.topSector.sector, 'IT');
  assert.strictEqual(p.diversification.metrics.topSector.weightPct, 50);
  assert.strictEqual(s.pillars.reduce((t, x) => t + x.max, 0), 100);
});

test('Resilience score: empty profile is flagged and does not crash', () => {
  const empty = consolidate({ accounts: [], holdings: [], liabilities: [], cashflows: [] }, { type: 'family' }, members);
  const s = scorePosition(empty);
  assert.strictEqual(s.hasData, false);
  for (const p of s.pillars) assert.ok(Number.isFinite(p.points));
});

test('Resilience score: pillar boundary values', () => {
  assert.strictEqual(piecewise(0.2, [[0, 15], [0.2, 12], [0.4, 6], [0.6, 0]]), 12);
  assert.strictEqual(piecewise(0.9, [[0, 15], [0.2, 12], [0.4, 6], [0.6, 0]]), 0);
  assert.strictEqual(piecewise(0.05, [[0.1, 8], [0.5, 0]]), 8);
});

test('Resilience score: change explanation names the moving pillar', () => {
  const before = scorePosition(fam);
  const richer = consolidate({ ...family, accounts: family.accounts.map((a) => (a.id === 'sav' ? { ...a, value: 600000 } : a)) }, { type: 'family' }, members);
  const after = scorePosition(richer);
  const diff = explainChange(before, after);
  assert.ok(diff.delta > 0);
  assert.strictEqual(diff.changes[0].pillar, 'emergency');
});

test('Stress: combined market crash, job loss and medical bill', () => {
  const r = runScenario(fam, [
    { type: 'market', declinePct: 20 },
    { type: 'one_time_expense', amount: 100000, month: 0 },
    { type: 'income_change', changePct: -100, months: 6, startMonth: 0 },
  ]);
  assert.strictEqual(r.impact.portfolioLoss, 80000);
  assert.strictEqual(r.impact.portfolioLossPct, 20);
  assert.strictEqual(r.impact.netWorthChangeImmediate, -180000);
  near(r.impact.cashRunwayMonths, 2.8);
  assert.strictEqual(r.impact.totalRunwayMonths, null);
  assert.strictEqual(r.impact.forcedSales, 342000);
  assert.strictEqual(r.impact.firstForcedSaleMonth, 3);
  assert.strictEqual(r.impact.netWorthChangeEndOfHorizon, 492000);
  assert.strictEqual(r.assumptions.horizonMonths, 24);
  assert.strictEqual(r.projection[24].cash, 1314000);
  assert.strictEqual(r.recovery.cashRebuildMonths, 6);
  assert.strictEqual(r.recovery.portfolioRecoveryMonths, 29);
  assert.strictEqual(r.verdict.level, 'severe');
  assert.strictEqual(r.after.liquidAssets, 300000);
  near(r.afterScore.score, 38.2, 0.11);
  assert.strictEqual(r.afterScore.band, 'critical');
});

test('Stress: stock-specific shock compounds with market shock', () => {
  const r = runScenario(fam, [{ type: 'market', declinePct: 10 }, { type: 'stock', symbol: 'TCS', declinePct: 50 }]);
  // TCS: 100000 × (1 − 0.9 × 0.5) = 55000; others: 300000 × 10% = 30000
  assert.strictEqual(r.impact.portfolioLoss, 85000);
  assert.strictEqual(r.impact.hardestHitPositions[0].symbol, 'TCS');
});

test('Stress: sector shock hits only that sector', () => {
  const r = runScenario(fam, [{ type: 'sector', sector: 'it', declinePct: 25 }]);
  assert.strictEqual(r.impact.portfolioLoss, 50000);
});

test('Stress: recurring medical ₹30,000/month for 6 months', () => {
  const r = runScenario(fam, [{ type: 'recurring_expense', monthlyAmount: 30000, months: 6, startMonth: 0 }]);
  // Net per month during shock = 73000 − 30000 = 43000; no depletion.
  assert.strictEqual(r.projection[6].cash, 400000 + 6 * 43000);
  assert.strictEqual(r.impact.forcedSales, 0);
  assert.strictEqual(r.verdict.level, 'ok');
});

test('Stress: member-specific job loss uses only that member income', () => {
  const r = runScenario(fam, [{ type: 'income_change', userId: B, changePct: -100, months: 3, startMonth: 0 }]);
  assert.strictEqual(r.projection[1].net, 13000); // 120000 − 107000
});

test('Stress: invalid shocks are rejected', () => {
  assert.throws(() => runScenario(fam, [{ type: 'market', declinePct: 120 }]), /declinePct/);
  assert.throws(() => runScenario(fam, [{ type: 'nope' }]), /Unknown shock/);
});

test('Reverse stress: market decline that wipes 10% of net worth', () => {
  const r = reverseStress(fam, { variable: 'market_decline', condition: { type: 'networth_drop_above', pct: 10 } });
  near(r.threshold, 61.25, 0.1); // 400000 × d / 2450000 > 10%
});

test('Reverse stress: largest emergency bill before cash dips below ₹1L', () => {
  const r = reverseStress(fam, { variable: 'one_time_expense', condition: { type: 'cash_below', floor: 100000 } });
  assert.ok(r.threshold > 300000 && r.threshold <= 300200, `got ${r.threshold}`);
});

test('Reverse stress: months of lost income before forced selling', () => {
  const r = reverseStress(fam, { variable: 'income_loss_months', condition: { type: 'forced_selling' } });
  assert.strictEqual(r.threshold, 4); // 400000 covers 3 × 107000, not 4
});

test('Scenario comparison runs every preset', () => {
  const rows = compareScenarios(fam, PRESETS);
  assert.strictEqual(rows.length, PRESETS.length);
  for (const row of rows) assert.ok(Number.isFinite(row.scoreAfter));
});

test('Recovery plans use the recorded discretionary spending', () => {
  const { recoveryPlans } = require('../engine/recovery');
  const r = recoveryPlans(fam, { cashAfterShock: 100000 });
  // essential outflows 87,000 × 6 = 5,22,000 target; gap 4,22,000
  assert.strictEqual(r.baseline.emergencyTarget, 522000);
  assert.strictEqual(r.baseline.emergencyGap, 422000);
  const bal = r.plans.find((p) => p.id === 'balanced');
  assert.strictEqual(bal.monthlyExpenseReduction, 6000);       // 30% of ₹20,000 discretionary
  assert.strictEqual(bal.newMonthlySurplus, 79000);            // 73,000 + 6,000
  assert.strictEqual(bal.monthsToRebuildEmergencyFund, 6);     // ceil(4,22,000 / 79,000)
  const none = recoveryPlans({ ...fam, cashflow: { ...fam.cashflow, discretionaryExpenses: 0 } });
  assert.ok(none.notes[0].includes('No discretionary expenses'));
});
