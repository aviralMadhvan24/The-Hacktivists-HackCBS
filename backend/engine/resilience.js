// Five-pillar Financial Resilience Score (0–100). Deterministic and documented.
// Full methodology: docs/RESILIENCE_SCORE.md. Each pillar is a continuous,
// piecewise-linear function of one or two metrics, so small changes in the
// inputs move the score smoothly and every point can be traced to a metric.

const { round1, round2, clamp, piecewise, formatINR } = require('./money');

const ENGINE_VERSION = 'resilience-1.0.0';
// Fixed reference shock for Pillar 5, so the baseline score does not depend on
// whatever scenario the user last played with.
const REFERENCE_EQUITY_SHOCK_PCT = 30;

const PILLARS = {
  emergency: { key: 'emergency', name: 'Emergency Cash Coverage', max: 30 },
  cashflow: { key: 'cashflow', name: 'Cash Flow & Burn', max: 25 },
  debt: { key: 'debt', name: 'Debt & EMI Burden', max: 15 },
  diversification: { key: 'diversification', name: 'Portfolio Diversification', max: 15 },
  shock: { key: 'shock', name: 'Market Shock Absorption', max: 15 },
};

function rating(points, max) {
  const r = points / max;
  if (r >= 0.85) return 'strong';
  if (r >= 0.6) return 'adequate';
  if (r >= 0.3) return 'weak';
  return 'critical';
}

// ---- Pillar 1: Emergency Cash Coverage (30) --------------------------------
// coverage = liquid assets / (essential expenses + EMIs), in months.
// points = 5 per month of coverage, capped at 30 (6 months).
function pillarEmergency(pos) {
  const liquid = pos.assets.liquid;
  const essential = pos.cashflow.essentialOutflows;
  const notes = [];
  let months;
  let points;
  if (essential <= 0) {
    months = null;
    points = liquid > 0 ? 30 : 0;
    notes.push(essential === 0 && liquid === 0
      ? 'No liquid assets or essential expenses recorded yet.'
      : 'No essential expenses recorded; coverage cannot be measured in months.');
  } else {
    months = liquid / essential;
    points = Math.min(30, 5 * months);
  }
  const actions = [];
  if (essential > 0 && months < 6) {
    const gap = essential * 6 - liquid;
    actions.push({
      text: `Add ${formatINR(gap)} to liquid savings to reach 6 months of essential outflows.`,
      pointsGain: round1(30 - points),
    });
  }
  return {
    ...PILLARS.emergency,
    points: round1(points),
    metrics: { liquidAssets: round2(liquid), essentialMonthlyOutflows: round2(essential), coverageMonths: months === null ? null : round2(months) },
    formula: 'coverage months = liquid assets ÷ (essential expenses + EMIs); points = min(30, 5 × months).',
    explanation: months === null
      ? notes[0]
      : `Liquid assets of ${formatINR(liquid)} cover ${months.toFixed(1)} months of essential outflows (${formatINR(essential)}/month).`,
    actions,
    notes,
  };
}

// ---- Pillar 2: Cash Flow & Burn (25) ---------------------------------------
// Surplus: savings rate s = (income − outflows) / income. points = 15 + 10 × min(1, s / 20%).
// Deficit: burn ratio b = burn / outflows. points = 15 × (1 − b).
function pillarCashflow(pos) {
  const { monthlyIncome: income, monthlyOutflows: outflows } = pos.cashflow;
  const notes = [];
  let points;
  let savingsRate = null;
  let burnRatio = null;
  if (income === 0 && outflows === 0) {
    points = 0;
    notes.push('No income or expenses recorded yet.');
  } else if (income >= outflows) {
    savingsRate = (income - outflows) / income;
    points = 15 + 10 * Math.min(1, savingsRate / 0.2);
  } else {
    burnRatio = (outflows - income) / outflows;
    points = 15 * (1 - burnRatio);
  }
  const actions = [];
  if (income > 0 && (savingsRate === null || savingsRate < 0.2)) {
    const targetOutflows = income * 0.8;
    actions.push({
      text: `Bring monthly outflows from ${formatINR(outflows)} down to ${formatINR(targetOutflows)} (a 20% savings rate), or raise income.`,
      pointsGain: round1(25 - points),
    });
  }
  if (income === 0 && outflows > 0) notes.push('No income recorded: every rupee of spending draws down savings.');
  return {
    ...PILLARS.cashflow,
    points: round1(points),
    metrics: {
      monthlyIncome: round2(income), monthlyOutflows: round2(outflows),
      savingsRatePct: savingsRate === null ? null : round2(savingsRate * 100),
      burnRatioPct: burnRatio === null ? null : round2(burnRatio * 100),
    },
    formula: 'If income ≥ outflows: 15 + 10 × min(1, savings rate ÷ 20%). Otherwise: 15 × (1 − burn ÷ outflows).',
    explanation: savingsRate !== null
      ? `Saving ${(savingsRate * 100).toFixed(1)}% of income (${formatINR(income - outflows)}/month).`
      : burnRatio !== null
        ? `Spending exceeds income by ${formatINR(outflows - income)}/month (${(burnRatio * 100).toFixed(0)}% of outflows unfunded).`
        : notes[0],
    actions,
    notes,
  };
}

// ---- Pillar 3: Debt & EMI Burden (15) --------------------------------------
// FOIR-style ratio d = EMIs / income. 0% → 15, 20% → 12, 40% → 6, ≥60% → 0.
function pillarDebt(pos) {
  const emi = pos.cashflow.monthlyEmi;
  const income = pos.cashflow.monthlyIncome;
  const notes = [];
  let ratio = null;
  let points;
  if (emi === 0) points = 15;
  else if (income === 0) { points = 0; notes.push('EMIs are due but no income is recorded.'); }
  else {
    ratio = emi / income;
    points = piecewise(ratio, [[0, 15], [0.2, 12], [0.4, 6], [0.6, 0]]);
  }
  const actions = [];
  if (ratio !== null && ratio > 0.2) {
    actions.push({
      text: `Reduce EMIs by ${formatINR(emi - income * 0.2)}/month (prepay or refinance) to bring them under 20% of income.`,
      pointsGain: round1(12 - points),
    });
  }
  return {
    ...PILLARS.debt,
    points: round1(points),
    metrics: { monthlyEmi: round2(emi), monthlyIncome: round2(income), emiToIncomePct: ratio === null ? (emi === 0 ? 0 : null) : round2(ratio * 100), totalDebt: pos.liabilities.total },
    formula: 'EMI-to-income ratio: 0% → 15 pts, 20% → 12, 40% → 6, 60%+ → 0 (linear between).',
    explanation: emi === 0 ? 'No EMIs.' : ratio === null ? notes[0] : `EMIs take ${(ratio * 100).toFixed(1)}% of monthly income.`,
    actions,
    notes,
  };
}

// ---- Pillar 4: Portfolio Diversification (15) ------------------------------
// Over equity-exposed positions:
//  - single-stock concentration (8 pts): largest individual stock weight; ≤10% → 8, ≥50% → 0.
//    Funds and ETFs are treated as already diversified and excluded.
//  - sector concentration (7 pts): largest sector weight among direct stocks; ≤25% → 7, ≥70% → 0.
// With no market investments there is no concentration risk: full points, flagged.
function concentration(positions) {
  const equity = positions.filter((p) => p.equityValue > 0);
  const total = equity.reduce((s, p) => s + p.equityValue, 0);
  const bySymbol = new Map();
  const bySector = new Map();
  for (const p of equity) {
    if (p.diversified) continue;
    const key = p.symbol || p.name;
    bySymbol.set(key, (bySymbol.get(key) || 0) + p.equityValue);
    bySector.set(p.sector, (bySector.get(p.sector) || 0) + p.equityValue);
  }
  const top = (m) => [...m.entries()].sort((a, b) => b[1] - a[1])[0] || null;
  const topStock = top(bySymbol);
  const topSector = top(bySector);
  return {
    totalEquity: total,
    topStock: topStock ? { symbol: topStock[0], weightPct: (topStock[1] / total) * 100 } : null,
    topSector: topSector ? { sector: topSector[0], weightPct: (topSector[1] / total) * 100 } : null,
    sectorWeights: [...bySector.entries()].map(([sector, v]) => ({ sector, weightPct: round2((v / total) * 100) }))
      .sort((a, b) => b.weightPct - a.weightPct),
    diversifiedFundPct: total > 0
      ? round2((equity.filter((p) => p.diversified).reduce((s, p) => s + p.equityValue, 0) / total) * 100) : 0,
  };
}

function pillarDiversification(pos) {
  const c = concentration(pos.positions);
  const notes = [];
  if (c.totalEquity <= 0) {
    notes.push('No market investments recorded, so there is no concentration risk to score.');
    return {
      ...PILLARS.diversification, points: 15,
      metrics: { equityExposure: 0, topStock: null, topSector: null, sectorWeights: [] },
      formula: 'Largest stock weight (≤10% → 8 pts, ≥50% → 0) + largest sector weight (≤25% → 7 pts, ≥70% → 0).',
      explanation: notes[0], actions: [], notes,
    };
  }
  const stockW = c.topStock ? c.topStock.weightPct / 100 : 0;
  const sectorW = c.topSector ? c.topSector.weightPct / 100 : 0;
  const stockPts = piecewise(stockW, [[0.1, 8], [0.5, 0]]);
  const sectorPts = piecewise(sectorW, [[0.25, 7], [0.7, 0]]);
  const actions = [];
  if (stockW > 0.1) {
    const excess = (stockW - 0.1) * c.totalEquity;
    actions.push({ text: `Trim ${c.topStock.symbol} by about ${formatINR(excess)} so no single stock exceeds 10% of equity holdings.`, pointsGain: round1(8 - stockPts) });
  }
  if (sectorW > 0.25) {
    actions.push({ text: `Reduce ${c.topSector.sector} exposure from ${c.topSector.weightPct.toFixed(0)}% toward 25% of equity holdings.`, pointsGain: round1(7 - sectorPts) });
  }
  return {
    ...PILLARS.diversification,
    points: round1(stockPts + sectorPts),
    metrics: {
      equityExposure: round2(c.totalEquity),
      topStock: c.topStock && { symbol: c.topStock.symbol, weightPct: round2(c.topStock.weightPct) },
      topSector: c.topSector && { sector: c.topSector.sector, weightPct: round2(c.topSector.weightPct) },
      sectorWeights: c.sectorWeights,
      diversifiedFundPct: c.diversifiedFundPct,
      stockConcentrationPoints: round1(stockPts),
      sectorConcentrationPoints: round1(sectorPts),
    },
    formula: 'Largest stock weight (≤10% → 8 pts, ≥50% → 0) + largest sector weight (≤25% → 7 pts, ≥70% → 0). Funds/ETFs count as diversified.',
    explanation: c.topStock
      ? `Largest stock ${c.topStock.symbol} is ${c.topStock.weightPct.toFixed(1)}% of equity; largest sector ${c.topSector.sector} is ${c.topSector.weightPct.toFixed(1)}%.`
      : 'Equity exposure is entirely through diversified funds/ETFs.',
    actions,
    notes,
  };
}

// ---- Pillar 5: Market Shock Absorption (15) --------------------------------
// drawdown = (equity exposure × 30% reference shock) ÷ net worth.
// points = 15 × (1 − drawdown ÷ 30%), clamped to [0, 15]. Net worth ≤ 0 → 0.
function pillarShock(pos) {
  const exposure = pos.assets.equityExposure;
  const netWorth = pos.netWorth;
  const loss = exposure * (REFERENCE_EQUITY_SHOCK_PCT / 100);
  const notes = [];
  let drawdown = null;
  let points;
  if (netWorth <= 0) {
    points = 0;
    notes.push(netWorth < 0 ? 'Net worth is negative, so any market loss deepens the deficit.' : 'Net worth is zero.');
  } else {
    drawdown = loss / netWorth;
    points = 15 * clamp(1 - drawdown / 0.3, 0, 1);
  }
  const actions = [];
  if (drawdown !== null && drawdown > 0.1) {
    actions.push({
      text: `A ${REFERENCE_EQUITY_SHOCK_PCT}% market fall would cut net worth by ${(drawdown * 100).toFixed(1)}% (${formatINR(loss)}). Balancing equity with FDs or debt funds lowers this.`,
      pointsGain: round1(15 - points),
    });
  }
  return {
    ...PILLARS.shock,
    points: round1(points),
    metrics: {
      equityExposure: round2(exposure), referenceShockPct: REFERENCE_EQUITY_SHOCK_PCT,
      referenceLoss: round2(loss), netWorth: round2(netWorth),
      netWorthDrawdownPct: drawdown === null ? null : round2(drawdown * 100),
    },
    formula: `drawdown = equity exposure × ${REFERENCE_EQUITY_SHOCK_PCT}% ÷ net worth; points = 15 × (1 − drawdown ÷ 30%), clamped 0–15.`,
    explanation: drawdown === null ? notes[0]
      : `A ${REFERENCE_EQUITY_SHOCK_PCT}% equity crash would reduce net worth by ${(drawdown * 100).toFixed(1)}%.`,
    actions,
    notes,
  };
}

function band(score) {
  if (score >= 85) return 'strong';
  if (score >= 70) return 'healthy';
  if (score >= 40) return 'fragile';
  return 'critical';
}

/** Scores a consolidated position (from consolidate() or a stressed position). */
function scorePosition(pos) {
  const pillars = [pillarEmergency(pos), pillarCashflow(pos), pillarDebt(pos), pillarDiversification(pos), pillarShock(pos)]
    .map((p) => ({ ...p, rating: rating(p.points, p.max) }));
  const total = round1(pillars.reduce((s, p) => s + p.points, 0));
  const actions = pillars.flatMap((p) => p.actions.map((a) => ({ ...a, pillar: p.key })))
    .filter((a) => a.pointsGain > 0)
    .sort((a, b) => b.pointsGain - a.pointsGain);
  const hasData = pos.assets.total > 0 || pos.cashflow.monthlyIncome > 0 || pos.cashflow.monthlyOutflows > 0;
  return {
    engineVersion: ENGINE_VERSION,
    score: total,
    band: band(total),
    hasData,
    pillars,
    topActions: actions.slice(0, 5),
    disclaimer: 'A deterministic internal resilience index built from your recorded data. It is not a credit rating, investment advice, or a guarantee.',
  };
}

/** Explains per-pillar changes between two score reports. */
function explainChange(prev, curr) {
  if (!prev) return { delta: null, changes: [], summary: 'No earlier score to compare against.' };
  const changes = [];
  for (const p of curr.pillars) {
    const before = prev.pillars.find((x) => x.key === p.key);
    if (!before) continue;
    const delta = round1(p.points - before.points);
    if (Math.abs(delta) < 0.1) continue;
    const metricChanges = [];
    for (const [k, v] of Object.entries(p.metrics)) {
      const old = before.metrics[k];
      if (typeof v === 'number' && typeof old === 'number' && Math.abs(v - old) > 0.005) {
        metricChanges.push({ metric: k, from: old, to: v });
      }
    }
    changes.push({ pillar: p.key, name: p.name, from: before.points, to: p.points, delta, metricChanges, explanation: p.explanation });
  }
  const delta = round1(curr.score - prev.score);
  changes.sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta));
  const summary = delta === 0 ? 'Score unchanged.'
    : `Score ${delta > 0 ? 'rose' : 'fell'} by ${Math.abs(delta)} points, mainly from ${changes.slice(0, 2).map((c) => `${c.name} (${c.delta > 0 ? '+' : ''}${c.delta})`).join(' and ')}.`;
  return { delta, changes, summary };
}

module.exports = { scorePosition, explainChange, concentration, band, ENGINE_VERSION, REFERENCE_EQUITY_SHOCK_PCT, PILLARS };
