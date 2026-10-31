// "What happens to our position if we make this decision?"
// Applies a proposed decision to a consolidated position and re-scores it.
// Pure and deterministic.
//
// Supported decisions (amounts in INR):
//   buy_stock  { amount, symbol, sector, fundFrom: 'liquid'|'semi_liquid' }  cash → equity position; net worth unchanged
//   sell_stock { amount, symbol }                                            equity position → liquid cash
//   purchase   { amount, assetValue?, fundFrom }                             spend cash; optional asset kept (e.g. a car)
//   loan       { principal, emiMonthly, cashReceived? }                      add debt + EMI; principal spent unless cashReceived
//   recurring  { monthlyAmount }                                             new monthly commitment (e.g. school fees)

const { finalisePosition } = require('./consolidation');
const { scorePosition } = require('./resilience');
const { runScenario } = require('./stress');
const { round2 } = require('./money');

function clonePosRaw(pos) {
  return {
    assets: { ...pos.assets, byKind: { ...pos.assets.byKind } },
    liabilities: { ...pos.liabilities, byKind: { ...pos.liabilities.byKind } },
    cashflow: {
      monthlyIncome: pos.cashflow.monthlyIncome,
      essentialExpenses: pos.cashflow.essentialExpenses,
      discretionaryExpenses: pos.cashflow.discretionaryExpenses,
      incomeByUser: { ...pos.cashflow.incomeByUser },
    },
    positions: pos.positions.map((p) => ({ ...p })),
    accountRows: pos.accounts.map((a) => ({ ...a })),
  };
}

function withdraw(raw, amount, fundFrom) {
  const bucket = fundFrom === 'semi_liquid' ? 'semiLiquid' : 'liquid';
  const available = raw.assets[bucket];
  raw.assets[bucket] -= amount;
  raw.assets.total -= amount;
  return { bucket, shortfall: Math.max(0, amount - available) };
}

function applyDecision(pos, decision) {
  const raw = clonePosRaw(pos);
  const warnings = [];
  const d = decision;
  switch (d.kind) {
    case 'buy_stock': {
      const { shortfall } = withdraw(raw, d.amount, d.fundFrom);
      if (shortfall > 0) warnings.push(`Not enough ${d.fundFrom === 'semi_liquid' ? 'semi-liquid' : 'liquid'} funds: short by ${round2(shortfall)}.`);
      raw.assets.semiLiquid += d.amount;
      raw.assets.total += d.amount;
      raw.assets.equityExposure += d.amount;
      raw.positions.push({ accountId: '__proposed__', symbol: String(d.symbol).toUpperCase(), name: d.name || d.symbol, sector: d.sector || 'Unclassified', instrument: 'equity', diversified: false, value: d.amount, equityValue: d.amount });
      raw.accountRows.push({ id: '__proposed__', liquidity: 'semi_liquid' });
      break;
    }
    case 'sell_stock': {
      let remaining = d.amount;
      for (const p of raw.positions) {
        if (remaining <= 0) break;
        if (p.symbol && p.symbol.toUpperCase() === String(d.symbol).toUpperCase()) {
          const take = Math.min(p.equityValue, remaining);
          p.equityValue -= take; p.value -= take; remaining -= take;
        }
      }
      const sold = d.amount - remaining;
      if (remaining > 0) warnings.push(`Only ${round2(sold)} of ${d.symbol} is held in your visible records.`);
      raw.assets.equityExposure -= sold;
      raw.assets.semiLiquid -= sold;
      raw.assets.liquid += sold;
      break;
    }
    case 'purchase': {
      const { shortfall } = withdraw(raw, d.amount, d.fundFrom);
      if (shortfall > 0) warnings.push(`Not enough funds: short by ${round2(shortfall)}.`);
      if (d.assetValue > 0) { raw.assets.illiquid += d.assetValue; raw.assets.total += d.assetValue; }
      break;
    }
    case 'loan': {
      raw.liabilities.total += d.principal;
      raw.liabilities.monthlyEmi += d.emiMonthly || 0;
      if (d.cashReceived) { raw.assets.liquid += d.principal; raw.assets.total += d.principal; }
      break;
    }
    case 'recurring': {
      if (d.essential === false) raw.cashflow.discretionaryExpenses += d.monthlyAmount;
      else raw.cashflow.essentialExpenses += d.monthlyAmount;
      break;
    }
    default:
      throw Object.assign(new Error(`Unsupported decision kind: ${d.kind}`), { code: 'INVALID_DECISION' });
  }
  return { position: finalisePosition(raw), warnings };
}

/** Before/after comparison of a decision, including how it fares in a standard crash. */
function evaluateDecision(pos, decision, { stressShocks = [{ type: 'market', declinePct: 30 }] } = {}) {
  const { position: after, warnings } = applyDecision(pos, decision);
  const scoreBefore = scorePosition(pos);
  const scoreAfter = scorePosition(after);
  const stressBefore = runScenario(pos, stressShocks);
  const stressAfter = runScenario(after, stressShocks);
  const pillarDeltas = scoreAfter.pillars.map((p) => {
    const b = scoreBefore.pillars.find((x) => x.key === p.key);
    return { pillar: p.key, name: p.name, before: b.points, after: p.points, delta: round2(p.points - b.points) };
  });
  return {
    decision,
    warnings,
    before: { netWorth: pos.netWorth, liquid: pos.assets.liquid, equityExposure: pos.assets.equityExposure, monthlyOutflows: pos.cashflow.monthlyOutflows, runway: pos.runway, score: scoreBefore.score },
    after: { netWorth: after.netWorth, liquid: after.assets.liquid, equityExposure: after.assets.equityExposure, monthlyOutflows: after.cashflow.monthlyOutflows, runway: after.runway, score: scoreAfter.score },
    scoreDelta: round2(scoreAfter.score - scoreBefore.score),
    pillarDeltas,
    diversification: {
      before: scoreBefore.pillars.find((p) => p.key === 'diversification').metrics,
      after: scoreAfter.pillars.find((p) => p.key === 'diversification').metrics,
    },
    stressTest: {
      shocks: stressShocks,
      before: { portfolioLoss: stressBefore.impact.portfolioLoss, scoreAfterShock: stressBefore.afterScore.score, forcedSales: stressBefore.impact.forcedSales, verdict: stressBefore.verdict },
      after: { portfolioLoss: stressAfter.impact.portfolioLoss, scoreAfterShock: stressAfter.afterScore.score, forcedSales: stressAfter.impact.forcedSales, verdict: stressAfter.verdict },
    },
    scoreAfter,
  };
}

module.exports = { applyDecision, evaluateDecision };
