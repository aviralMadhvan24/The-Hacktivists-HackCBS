// Scenario-based stress testing over a consolidated position.
// Pure and deterministic. Methodology: docs/STRESS_ENGINE.md.
//
// Model in brief
//  1. Market shocks hit equity exposure immediately (t = 0). A stock- or
//     sector-specific decline compounds with any market-wide decline:
//     value × (1 − market) × (1 − specific).
//  2. Month-by-month cash projection. Each month: income − expenses − EMIs −
//     scenario costs. Investments earn nothing in the projection (conservative,
//     stated as an assumption). When liquid cash goes negative, semi-liquid
//     assets (FDs, funds, stocks at post-shock value) are drawn down if the
//     scenario allows forced selling.
//  3. The "after" score is computed on the stressed position: post-shock
//     assets and the cash flow of the first shocked month.

const { round1, round2, clamp, formatINR } = require('./money');
const { finalisePosition } = require('./consolidation');
const { scorePosition } = require('./resilience');

const ENGINE_VERSION = 'stress-1.0.0';
const MAX_HORIZON = 120;
const DEFAULT_ASSUMPTIONS = {
  horizonMonths: 24,
  allowForcedSelling: true,
  // Used only for the portfolio recovery estimate. An assumption, not a forecast.
  assumedAnnualEquityReturnPct: 10,
};

const SHOCK_TYPES = ['market', 'stock', 'sector', 'one_time_expense', 'recurring_expense', 'income_change', 'expense_change', 'inflation', 'emi_change'];

function validateShock(s) {
  if (!s || !SHOCK_TYPES.includes(s.type)) return `Unknown shock type: ${s && s.type}`;
  const pct = (v, lo, hi, name) => (typeof v === 'number' && v >= lo && v <= hi ? null : `${name} must be between ${lo} and ${hi}.`);
  const nonneg = (v, name) => (typeof v === 'number' && v >= 0 && Number.isFinite(v) ? null : `${name} must be a non-negative number.`);
  const month = (v, name) => (v === undefined || (Number.isInteger(v) && v >= 0 && v <= MAX_HORIZON) ? null : `${name} must be a whole month between 0 and ${MAX_HORIZON}.`);
  switch (s.type) {
    case 'market': return pct(s.declinePct, 0, 100, 'declinePct');
    case 'stock': return (s.symbol ? null : 'symbol is required.') || pct(s.declinePct, 0, 100, 'declinePct');
    case 'sector': return (s.sector ? null : 'sector is required.') || pct(s.declinePct, 0, 100, 'declinePct');
    case 'one_time_expense': return nonneg(s.amount, 'amount') || month(s.month, 'month');
    case 'recurring_expense': return nonneg(s.monthlyAmount, 'monthlyAmount') || month(s.startMonth, 'startMonth')
      || (Number.isInteger(s.months) && s.months >= 1 && s.months <= MAX_HORIZON ? null : 'months must be 1–120.');
    case 'income_change': return pct(s.changePct, -100, 100, 'changePct') || month(s.startMonth, 'startMonth')
      || (s.months === undefined || s.months === null || (Number.isInteger(s.months) && s.months >= 1) ? null : 'months must be a positive whole number.');
    case 'expense_change': return pct(s.changePct, -100, 500, 'changePct') || month(s.startMonth, 'startMonth');
    case 'inflation': return pct(s.annualPct, -20, 100, 'annualPct');
    case 'emi_change': return pct(s.changePct, -100, 500, 'changePct');
    default: return null;
  }
}

/** Applies market/stock/sector shocks; returns per-position losses. */
function applyMarketShocks(pos, shocks) {
  const market = shocks.filter((s) => s.type === 'market').reduce((acc, s) => acc * (1 - s.declinePct / 100), 1);
  const stockShocks = shocks.filter((s) => s.type === 'stock');
  const sectorShocks = shocks.filter((s) => s.type === 'sector');
  const liquidityByAccount = new Map(pos.accounts.map((a) => [a.id, a.liquidity]));
  // factors[i] is the remaining-value multiplier for pos.positions[i]'s equity part.
  const losses = { total: 0, liquid: 0, semiLiquid: 0, illiquid: 0, byPosition: [], factors: pos.positions.map(() => 1) };

  for (const [i, p] of pos.positions.entries()) {
    if (p.equityValue <= 0) continue;
    let factor = market;
    for (const s of stockShocks) {
      if (p.symbol && p.symbol.toUpperCase() === String(s.symbol).toUpperCase()) factor *= 1 - s.declinePct / 100;
    }
    for (const s of sectorShocks) {
      if (p.sector && p.sector.toLowerCase() === String(s.sector).toLowerCase()) factor *= 1 - s.declinePct / 100;
    }
    losses.factors[i] = factor;
    const loss = p.equityValue * (1 - factor);
    if (loss <= 0) continue;
    losses.total += loss;
    const bucket = liquidityByAccount.get(p.accountId) || 'semi_liquid';
    if (bucket === 'liquid') losses.liquid += loss;
    else if (bucket === 'semi_liquid') losses.semiLiquid += loss;
    else losses.illiquid += loss;
    losses.byPosition.push({ symbol: p.symbol, name: p.name, sector: p.sector, before: p.equityValue, loss: round2(loss), declinePct: round2((1 - factor) * 100) });
  }
  losses.byPosition.sort((a, b) => b.loss - a.loss);
  return losses;
}

function activeIn(shock, m) {
  const start = shock.startMonth ?? 0;
  if (m < start + 1) return false; // month m covers (m−1, m]; a shock starting at 0 applies from month 1
  if (shock.months === undefined || shock.months === null) return true;
  return m <= start + shock.months;
}

/** Monthly flows for month m (1-based) under the scenario. */
function monthFlows(pos, shocks, m) {
  const cf = pos.cashflow;
  let income = cf.monthlyIncome;
  for (const s of shocks.filter((x) => x.type === 'income_change' && activeIn(x, m))) {
    if (s.userId) {
      const userIncome = cf.incomeByUser[s.userId] || 0;
      income += userIncome * (s.changePct / 100);
    } else income *= 1 + s.changePct / 100;
  }
  income = Math.max(0, income);

  const inflation = shocks.filter((s) => s.type === 'inflation').reduce((acc, s) => acc * (1 + s.annualPct / 100) ** (m / 12), 1);
  let expenseFactor = inflation;
  for (const s of shocks.filter((x) => x.type === 'expense_change' && activeIn(x, m))) expenseFactor *= 1 + s.changePct / 100;
  const expenses = cf.monthlyExpenses * expenseFactor;
  const essentialExpenses = cf.essentialExpenses * expenseFactor;

  let emi = cf.monthlyEmi;
  for (const s of shocks.filter((x) => x.type === 'emi_change')) {
    const base = s.floatingOnly === false ? cf.monthlyEmi : pos.liabilities.floatingEmi;
    emi += base * (s.changePct / 100);
  }
  emi = Math.max(0, emi);

  let scenarioCosts = 0;
  for (const s of shocks.filter((x) => x.type === 'recurring_expense' && activeIn(x, m))) scenarioCosts += s.monthlyAmount;
  for (const s of shocks.filter((x) => x.type === 'one_time_expense' && (x.month ?? 0) === m)) scenarioCosts += s.amount;

  return { income, expenses, essentialExpenses, emi, scenarioCosts, net: income - expenses - emi - scenarioCosts };
}

function shockEndMonth(shocks) {
  let end = 0;
  for (const s of shocks) {
    if (s.type === 'one_time_expense') end = Math.max(end, s.month ?? 0);
    if (s.type === 'recurring_expense') end = Math.max(end, (s.startMonth ?? 0) + s.months);
    if ((s.type === 'income_change' || s.type === 'expense_change') && s.months) end = Math.max(end, (s.startMonth ?? 0) + s.months);
  }
  return end;
}

/**
 * Runs one scenario.
 * @param {object} pos consolidated position (consolidate())
 * @param {object[]} shocks list of shocks (see SHOCK_TYPES)
 * @param {object} [assumptions]
 */
function runScenario(pos, shocks, assumptions = {}) {
  for (const s of shocks) {
    const err = validateShock(s);
    if (err) throw Object.assign(new Error(err), { code: 'INVALID_SHOCK' });
  }
  const provided = Object.fromEntries(Object.entries(assumptions || {}).filter(([, v]) => v !== undefined && v !== null));
  const a = { ...DEFAULT_ASSUMPTIONS, ...provided };
  const endOfShock = shockEndMonth(shocks);
  const horizon = clamp(Math.max(a.horizonMonths, endOfShock + 6), 1, MAX_HORIZON);

  const loss = applyMarketShocks(pos, shocks);
  const immediateOneTime = shocks.filter((s) => s.type === 'one_time_expense' && (s.month ?? 0) === 0)
    .reduce((sum, s) => sum + s.amount, 0);

  // t = 0 state
  let cash = pos.assets.liquid - loss.liquid - immediateOneTime;
  let semi = pos.assets.semiLiquid - loss.semiLiquid;
  let cashOnly = cash;
  let forcedSales = 0;
  let cashRunwayMonths = cashOnly < 0 ? 0 : null;
  let totalRunwayMonths = cash + semi < 0 ? 0 : null;
  let firstForcedSaleMonth = null;
  let maxBurn = 0;
  let cumulativeNet = -immediateOneTime;

  if (cash < 0 && a.allowForcedSelling) {
    const draw = Math.min(-cash, Math.max(0, semi));
    semi -= draw; cash += draw; forcedSales += draw;
    if (draw > 0) firstForcedSaleMonth = 0;
  }

  const series = [{ month: 0, cash: round2(cash), semiLiquid: round2(semi), cumulativeForcedSales: round2(forcedSales), net: round2(-immediateOneTime) }];
  let firstMonthFlows = null;
  let endOfShockCash = endOfShock === 0 ? cash : null;

  for (let m = 1; m <= horizon; m++) {
    const f = monthFlows(pos, shocks, m);
    if (m === 1) firstMonthFlows = f;
    maxBurn = Math.max(maxBurn, -f.net);
    cumulativeNet += f.net;
    // Fractional-month runway: the month in which the balance crosses zero.
    if (cashRunwayMonths === null && cashOnly + f.net < 0 && f.net < 0) cashRunwayMonths = (m - 1) + Math.max(0, cashOnly) / -f.net;
    cashOnly += f.net;
    const totalBefore = cash + semi;
    if (totalRunwayMonths === null && totalBefore + f.net < 0 && f.net < 0) totalRunwayMonths = (m - 1) + Math.max(0, totalBefore) / -f.net;
    cash += f.net;
    if (cash < 0 && a.allowForcedSelling && semi > 0) {
      const draw = Math.min(-cash, semi);
      semi -= draw; cash += draw; forcedSales += draw;
      if (firstForcedSaleMonth === null) firstForcedSaleMonth = m;
    }
    if (m === endOfShock) endOfShockCash = cash;
    series.push({ month: m, cash: round2(cash), semiLiquid: round2(semi), cumulativeForcedSales: round2(forcedSales), net: round2(f.net) });
  }

  // Stressed position for the "after" score: post-shock assets, first-month flows.
  const f1 = firstMonthFlows || monthFlows(pos, shocks, 1);
  const stressedPos = finalisePosition({
    assets: {
      total: pos.assets.total - loss.total - immediateOneTime,
      liquid: Math.max(0, pos.assets.liquid - loss.liquid - immediateOneTime),
      semiLiquid: pos.assets.semiLiquid - loss.semiLiquid,
      illiquid: pos.assets.illiquid - loss.illiquid,
      equityExposure: pos.assets.equityExposure - loss.total,
      byKind: pos.assets.byKind,
    },
    liabilities: { ...pos.liabilities, monthlyEmi: f1.emi },
    cashflow: {
      monthlyIncome: f1.income,
      essentialExpenses: f1.essentialExpenses + f1.scenarioCosts,
      discretionaryExpenses: f1.expenses - f1.essentialExpenses,
      incomeByUser: pos.cashflow.incomeByUser,
    },
    positions: scalePositions(pos.positions, loss),
    accountRows: pos.accounts,
  });
  // Shortfall immediately after shocks shows as negative liquid cash in "after".
  const immediateLiquid = pos.assets.liquid - loss.liquid - immediateOneTime;

  const before = summarise(pos, scorePosition(pos));
  const afterScore = scorePosition(stressedPos);
  const after = summarise(stressedPos, afterScore);
  after.liquidAssets = round2(immediateLiquid);

  const recovery = estimateRecovery({ pos, loss, endOfShockCash, endOfShock, assumptions: a });
  const portfolioBefore = pos.assets.equityExposure;

  return {
    engineVersion: ENGINE_VERSION,
    shocks,
    assumptions: { ...a, horizonMonths: horizon },
    before,
    after,
    beforeScore: scorePosition(pos),
    afterScore,
    impact: {
      portfolioLoss: round2(loss.total),
      portfolioLossPct: portfolioBefore > 0 ? round2((loss.total / portfolioBefore) * 100) : 0,
      immediateCashOutflow: round2(immediateOneTime),
      netWorthChangeImmediate: round2(-(loss.total + immediateOneTime)),
      netWorthChangeEndOfHorizon: round2(-loss.total + cumulativeNet),
      peakMonthlyBurn: round2(Math.max(0, maxBurn)),
      cashRunwayMonths: cashRunwayMonths === null ? null : round1(cashRunwayMonths),
      totalRunwayMonths: totalRunwayMonths === null ? null : round1(totalRunwayMonths),
      forcedSales: round2(forcedSales),
      firstForcedSaleMonth,
      shortfallAtHorizon: cash < 0 ? round2(-cash) : 0,
      scoreChange: round1(afterScore.score - before.score),
      hardestHitPositions: loss.byPosition.slice(0, 5),
    },
    recovery,
    projection: series,
    verdict: verdict({ cashRunwayMonths, totalRunwayMonths, forcedSales, cash, horizon }),
  };
}

function scalePositions(positions, loss) {
  return positions.map((p, i) => {
    const l = p.equityValue * (1 - loss.factors[i]);
    return { ...p, value: Math.max(0, p.value - l), equityValue: Math.max(0, p.equityValue - l) };
  });
}

function summarise(pos, score) {
  return {
    netWorth: pos.netWorth,
    liquidAssets: pos.assets.liquid,
    semiLiquidAssets: pos.assets.semiLiquid,
    equityExposure: pos.assets.equityExposure,
    monthlyIncome: pos.cashflow.monthlyIncome,
    monthlyOutflows: pos.cashflow.monthlyOutflows,
    monthlyBurn: pos.cashflow.netBurn,
    monthlyEmi: pos.cashflow.monthlyEmi,
    emiToIncomePct: pos.cashflow.monthlyIncome > 0 ? round2((pos.cashflow.monthlyEmi / pos.cashflow.monthlyIncome) * 100) : null,
    emergencyCoverageMonths: pos.cashflow.essentialOutflows > 0 ? round2(pos.assets.liquid / pos.cashflow.essentialOutflows) : null,
    runway: pos.runway,
    score: score.score,
    band: score.band,
  };
}

function estimateRecovery({ pos, loss, endOfShockCash, endOfShock, assumptions }) {
  const baseSavings = pos.cashflow.monthlySavings;
  const cashGap = endOfShockCash === null ? null : pos.assets.liquid - endOfShockCash;
  let cashMonths = null;
  let cashNote;
  if (cashGap === null || cashGap <= 0) { cashMonths = 0; cashNote = 'Liquid cash is not reduced by the end of the shock period.'; }
  else if (baseSavings > 0) {
    cashMonths = Math.ceil(cashGap / baseSavings);
    cashNote = `Rebuilding ${formatINR(cashGap)} at the normal saving rate of ${formatINR(baseSavings)}/month.`;
  } else cashNote = 'Normal monthly cash flow has no surplus, so liquid cash does not rebuild without changes.';

  const lossPct = pos.assets.equityExposure > 0 ? loss.total / pos.assets.equityExposure : 0;
  const r = assumptions.assumedAnnualEquityReturnPct / 100;
  let portfolioMonths = 0;
  if (lossPct > 0 && lossPct < 1) {
    portfolioMonths = r > 0 ? Math.ceil(Math.log(1 / (1 - lossPct)) / Math.log((1 + r) ** (1 / 12))) : null;
  } else if (lossPct >= 1) portfolioMonths = null;

  return {
    cashRebuildMonths: cashMonths,
    cashRebuildNote: cashNote,
    cashRebuildStartsAfterMonth: endOfShock,
    portfolioRecoveryMonths: portfolioMonths,
    portfolioRecoveryNote: lossPct > 0
      ? `Assumes equities return ${assumptions.assumedAnnualEquityReturnPct}% a year after the shock. This is an assumption, not a prediction; recoveries have historically taken from months to many years.`
      : 'No market loss in this scenario.',
  };
}

function verdict({ cashRunwayMonths, totalRunwayMonths, forcedSales, cash, horizon }) {
  if (cash < 0) return { level: 'critical', text: `Money runs out within ${horizon} months even after selling investments.` };
  if (forcedSales > 0) return { level: 'severe', text: `Survivable, but only by selling ${formatINR(forcedSales)} of investments, possibly at depressed prices.` };
  if (cashRunwayMonths !== null) return { level: 'warning', text: `Liquid cash lasts about ${cashRunwayMonths.toFixed(1)} months.` };
  if (totalRunwayMonths !== null) return { level: 'warning', text: `Total liquid and semi-liquid assets last about ${totalRunwayMonths.toFixed(1)} months.` };
  return { level: 'ok', text: `Absorbed from cash reserves across the ${horizon}-month horizon.` };
}

/** Runs several named scenarios for side-by-side comparison. */
function compareScenarios(pos, scenarios, assumptions = {}) {
  return scenarios.map((sc) => {
    const r = runScenario(pos, sc.shocks, { ...assumptions, ...(sc.assumptions || {}) });
    return { name: sc.name, impact: r.impact, after: r.after, verdict: r.verdict, scoreAfter: r.afterScore.score };
  });
}

// ---- Reverse stress testing -------------------------------------------------
// Finds the smallest value of one variable at which a breach condition is met.
const REVERSE_VARIABLES = {
  market_decline: { lo: 0, hi: 100, integer: false, unit: '%', make: (v) => ({ type: 'market', declinePct: v }) },
  one_time_expense: { lo: 0, hi: null, integer: false, unit: '₹', make: (v) => ({ type: 'one_time_expense', amount: v, month: 0 }) },
  income_loss_months: { lo: 0, hi: MAX_HORIZON - 6, integer: true, unit: 'months', make: (v) => (v > 0 ? { type: 'income_change', changePct: -100, months: v, startMonth: 0 } : null) },
  monthly_expense_increase: { lo: 0, hi: null, integer: false, unit: '₹/month', make: (v) => ({ type: 'recurring_expense', monthlyAmount: v, months: 12, startMonth: 0 }) },
};

function isBreached(result, condition, pos) {
  switch (condition.type) {
    // Forced selling is disabled for this condition, so projection cash is cash alone.
    case 'cash_below': return result.projection.some((p) => p.cash < condition.floor);
    case 'forced_selling': return result.impact.forcedSales > 0;
    case 'runway_below': {
      const rw = result.impact.totalRunwayMonths;
      return rw !== null && rw < condition.months;
    }
    case 'score_below': return result.afterScore.score < condition.score;
    case 'networth_drop_above': return pos.netWorth > 0 && (-result.impact.netWorthChangeImmediate / pos.netWorth) * 100 > condition.pct;
    default: throw Object.assign(new Error(`Unknown breach condition: ${condition.type}`), { code: 'INVALID_CONDITION' });
  }
}

function reverseStress(pos, { variable, condition, baseShocks = [], assumptions = {} }) {
  const spec = REVERSE_VARIABLES[variable];
  if (!spec) throw Object.assign(new Error(`Unknown variable: ${variable}`), { code: 'INVALID_VARIABLE' });
  // With no forced selling the cash floor is checked on cash alone.
  const a = condition.type === 'cash_below' ? { ...assumptions, allowForcedSelling: false } : { ...assumptions };
  const hi = spec.hi ?? Math.max(1, (pos.assets.liquid + pos.assets.semiLiquid + pos.assets.illiquid) * 2);
  const test = (v) => {
    const extra = spec.make(v);
    const r = runScenario(pos, extra ? [...baseShocks, extra] : baseShocks, a);
    return { breached: isBreached(r, condition, pos), result: r };
  };

  const atLo = test(spec.lo);
  if (atLo.breached) {
    return { variable, condition, breachedAtZero: true, threshold: spec.lo, unit: spec.unit,
      explanation: 'The condition is already breached without this shock, from the other assumptions alone.', resultAtThreshold: atLo.result.impact };
  }
  const atHi = test(hi);
  if (!atHi.breached) {
    return { variable, condition, breachedAtZero: false, threshold: null, unit: spec.unit, testedUpTo: round2(hi),
      explanation: `Not breached anywhere in the tested range (up to ${spec.unit === '%' ? `${hi}%` : spec.unit === 'months' ? `${hi} months` : formatINR(hi)}).` };
  }
  let lo = spec.lo;
  let high = hi;
  for (let i = 0; i < 40 && high - lo > (spec.integer ? 1 : spec.unit === '%' ? 0.05 : 50); i++) {
    const mid = spec.integer ? Math.floor((lo + high) / 2) : (lo + high) / 2;
    if (mid === lo) break;
    if (test(mid).breached) high = mid; else lo = mid;
  }
  const threshold = spec.integer ? high : spec.unit === '%' ? round1(high) : Math.ceil(high / 100) * 100;
  const at = test(threshold);
  const label = spec.unit === '%' ? `${threshold}%` : spec.unit === 'months' ? `${threshold} months` : formatINR(threshold);
  return {
    variable, condition, breachedAtZero: false, threshold, unit: spec.unit,
    explanation: `${describeVariable(variable)} of ${label} or more breaches the condition (${describeCondition(condition)}).`,
    resultAtThreshold: at.result.impact,
  };
}

function describeVariable(v) {
  return {
    market_decline: 'A market-wide equity decline',
    one_time_expense: 'A one-time emergency expense',
    income_loss_months: 'Losing all household income for',
    monthly_expense_increase: 'An extra monthly expense (for 12 months)',
  }[v];
}

function describeCondition(c) {
  switch (c.type) {
    case 'cash_below': return `liquid cash falls below ${formatINR(c.floor)}`;
    case 'forced_selling': return 'investments must be sold to pay bills';
    case 'runway_below': return `runway drops under ${c.months} months`;
    case 'score_below': return `resilience score falls below ${c.score}`;
    case 'networth_drop_above': return `net worth falls by more than ${c.pct}%`;
    default: return c.type;
  }
}

// ---- Presets ---------------------------------------------------------------
const PRESETS = [
  { id: 'mild_correction', name: 'Mild correction (−5%)', shocks: [{ type: 'market', declinePct: 5 }] },
  { id: 'market_stress', name: 'Market stress (−15%)', shocks: [{ type: 'market', declinePct: 15 }] },
  { id: 'severe_crash', name: 'Severe crash (−30%)', shocks: [{ type: 'market', declinePct: 30 }] },
  { id: 'crisis_2008', name: '2008-scale crisis (−55%)', shocks: [{ type: 'market', declinePct: 55 }] },
  { id: 'medical_one_time', name: 'Medical emergency ₹2,00,000', shocks: [{ type: 'one_time_expense', amount: 200000, month: 0, label: 'Medical emergency' }] },
  { id: 'medical_recurring', name: 'Medical care ₹30,000/month for 6 months', shocks: [{ type: 'recurring_expense', monthlyAmount: 30000, months: 6, startMonth: 0, label: 'Ongoing medical care' }] },
  { id: 'job_loss_6m', name: 'Household income stops for 6 months', shocks: [{ type: 'income_change', changePct: -100, months: 6, startMonth: 0 }] },
  { id: 'income_cut_30', name: 'Income cut by 30% for 12 months', shocks: [{ type: 'income_change', changePct: -30, months: 12, startMonth: 0 }] },
  { id: 'rate_hike', name: 'Floating EMIs up 15% + 7% inflation', shocks: [{ type: 'emi_change', changePct: 15, floatingOnly: true }, { type: 'inflation', annualPct: 7 }] },
  { id: 'perfect_storm', name: 'Perfect storm: −30% market, job loss 6m, ₹2L medical', shocks: [
    { type: 'market', declinePct: 30 },
    { type: 'income_change', changePct: -100, months: 6, startMonth: 0 },
    { type: 'one_time_expense', amount: 200000, month: 0, label: 'Medical emergency' },
  ] },
];

module.exports = { runScenario, compareScenarios, reverseStress, validateShock, applyMarketShocks, PRESETS, SHOCK_TYPES, ENGINE_VERSION, DEFAULT_ASSUMPTIONS, REVERSE_VARIABLES };
