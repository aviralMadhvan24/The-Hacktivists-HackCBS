// AI investment intelligence: evaluates a proposed stock purchase in the context
// of the family's whole position.
//
// Design
//  - Every number comes from deterministic code over real data: YugabyteDB records,
//    market prices/history (Yahoo), fundamentals (Yahoo), the what-if and stress
//    engines. The LLM never computes figures.
//  - The LLM (if configured and the user consented to AI analysis) writes the
//    narrative from a fact sheet, and must cite which facts it used.
//  - Missing data is reported as missing. Nothing is guessed.
//  - It informs decisions; it never places trades or promises returns.
const { randomUUID } = require('crypto');
const { z } = require('zod');
const db = require('../db/pool');
const { validate, HttpError } = require('../lib/http');
const { audit } = require('../lib/audit');
const familyService = require('./familyService');
const analytics = require('./analyticsService');
const entitlements = require('./entitlements');
const { evaluateDecision } = require('../engine/whatif');
const { summarize, correlationsWith } = require('../engine/riskStats');
const { round2, formatINR } = require('../engine/money');

const INDEX_SYMBOL = '^NSEI';
const DIVERSIFIED_PROXY = { symbol: 'NIFTYBEES', name: 'Nippon India ETF Nifty 50 BeES', sector: 'Diversified (index ETF)' };

const defaultDeps = () => ({
  market: require('./marketData'),
  fundamentals: require('./marketData/fundamentals'),
  llm: require('../lib/llm'),
  memory: require('./meko/personMemory'),
});

const inputSchema = z.object({
  symbol: z.string().trim().min(1).max(30).transform((s) => s.toUpperCase().replace(/\.(NS|BO)$/, '')),
  exchange: z.enum(['NSE', 'BSE']).default('NSE'),
  amount: z.number().positive().max(1e11),
  fundFrom: z.enum(['liquid', 'semi_liquid']).default('liquid'),
  horizonYears: z.number().int().min(1).max(10).default(3),
  notes: z.string().trim().max(2000).optional(),
}).strict();

async function safe(label, fn, gaps) {
  try { return await fn(); } catch (err) { gaps.push(`${label}: ${err.message}`); return null; }
}

/** Transparent, rule-based checks. Each has a level and the facts behind it. */
function fitChecks({ position, impact, stats, fundamentals, amount, liabilities }) {
  const checks = [];
  const essential = position.cashflow.essentialOutflows;
  const liquidAfter = impact.after.liquid;
  const coverAfter = essential > 0 ? liquidAfter / essential : null;
  if (liquidAfter < 0) checks.push({ id: 'funds', level: 'high', text: `Not enough ${'liquid'} money: the purchase exceeds available funds by ${formatINR(-liquidAfter)}.` });
  else if (coverAfter !== null && coverAfter < 3) checks.push({ id: 'liquidity', level: 'high', text: `After buying, liquid savings cover only ${coverAfter.toFixed(1)} months of essential costs (target 6).` });
  else if (coverAfter !== null && coverAfter < 6) checks.push({ id: 'liquidity', level: 'medium', text: `After buying, liquid savings cover ${coverAfter.toFixed(1)} months of essential costs (target 6).` });
  else checks.push({ id: 'liquidity', level: 'ok', text: coverAfter === null ? 'No essential expenses recorded to compare against.' : `Emergency cover stays at ${coverAfter.toFixed(1)} months after buying.` });

  // Concentration: judge what the purchase changes, not what already existed.
  const before = impact.diversification.before;
  const div = impact.diversification.after;
  const concentration = (id, label, b, a, guide, highAt) => {
    if (!a || a.weightPct <= guide) return;
    const sameTop = b && (b.symbol ?? b.sector) === (a.symbol ?? a.sector);
    const worsens = !b || !sameTop || a.weightPct > b.weightPct + 0.05;
    if (!worsens) {
      checks.push({ id, level: 'info', text: `Existing concentration: ${label(a)} is ${b.weightPct}% now and ${a.weightPct}% after this purchase (guide ≤${guide}%). This purchase reduces it.` });
    } else {
      checks.push({ id, level: a.weightPct > highAt ? 'high' : 'medium', text: `${label(a)} would be ${a.weightPct}% of ${id === 'stock_concentration' ? 'equity' : 'direct stock'} holdings${b && sameTop ? ` (from ${b.weightPct}%)` : ''} (guide ≤${guide}%).` });
    }
  };
  concentration('stock_concentration', (x) => x.symbol, before.topStock, div.topStock, 10, 20);
  concentration('sector_concentration', (x) => x.sector, before.topSector, div.topSector, 25, 40);

  if (impact.scoreDelta <= -3) checks.push({ id: 'resilience', level: 'medium', text: `Resilience score falls by ${Math.abs(impact.scoreDelta)} points.` });

  if (stats && !stats.insufficientData) {
    if (stats.annualizedVolatilityPct > 40) checks.push({ id: 'volatility', level: 'high', text: `Very volatile: ${stats.annualizedVolatilityPct}% annualised volatility.` });
    else if (stats.annualizedVolatilityPct > 28) checks.push({ id: 'volatility', level: 'medium', text: `Above-average volatility: ${stats.annualizedVolatilityPct}% annualised.` });
    if (stats.maxDrawdownPct < -50) checks.push({ id: 'drawdown', level: 'medium', text: `Has fallen ${Math.abs(stats.maxDrawdownPct)}% from a peak within the data period.` });
  }
  if (fundamentals?.balanceSheet?.debtToEquity > 200 && !/financial|bank/i.test(fundamentals.sector || '')) {
    checks.push({ id: 'leverage', level: 'medium', text: `High leverage: debt-to-equity ${fundamentals.balanceSheet.debtToEquity}%.` });
  }
  const costly = liabilities.filter((l) => (l.interestRatePct ?? 0) >= 12 && l.outstanding > 0).sort((a, b) => b.interestRatePct - a.interestRatePct)[0];
  if (costly) checks.push({ id: 'expensive_debt', level: 'medium', text: `${costly.name} charges ${costly.interestRatePct}% interest; repaying it is a certain return of that rate.` });
  if (amount > position.netWorth * 0.2 && position.netWorth > 0) checks.push({ id: 'size', level: 'medium', text: `This is ${round2((amount / position.netWorth) * 100)}% of net worth in one stock.` });
  return checks;
}

function overallLevel(checks) {
  if (checks.some((c) => c.level === 'high')) return 'high_concern';
  if (checks.filter((c) => c.level === 'medium').length >= 2) return 'caution';
  if (checks.some((c) => c.level === 'medium')) return 'minor_concerns';
  return 'fits';
}

function scenarioTable(amount, stats, beta) {
  const rows = [];
  if (stats?.oneYearReturnRange) {
    const r = stats.oneYearReturnRange;
    for (const [label, p] of [['Bad year (5th percentile)', r.p5], ['Weak year (25th)', r.p25], ['Typical year (median)', r.median], ['Good year (75th)', r.p75], ['Very good year (95th)', r.p95]]) {
      rows.push({ scenario: label, basis: `Historical 1-year returns, ${stats.from} to ${stats.to}`, returnPct: p, gainLoss: round2(amount * p / 100) });
    }
  }
  const b = beta ?? 1;
  rows.push({ scenario: 'Market falls 30%', basis: `Beta ${beta === null || beta === undefined ? 'unknown, assumed 1.0' : b.toFixed(2)} × −30%`, returnPct: round2(-30 * b), gainLoss: round2(amount * -0.3 * b) });
  rows.push({ scenario: 'Company-specific shock (−50%)', basis: 'Fraud, regulatory action or failed business line', returnPct: -50, gainLoss: round2(-amount * 0.5) });
  return rows;
}

async function evaluate(familyId, userId, body, ip, deps = defaultDeps()) {
  await familyService.requireRole(familyId, userId, 'viewer');
  const input = validate(inputSchema, body);
  const usage = await entitlements.consume(userId, 'investment_agent');
  try {
    const gaps = [];
    const { position, data } = await analytics.positionFor(familyId, userId, { scope: 'family' });

    const quote = await safe('Price', () => deps.market.getQuote(input.symbol, false, input.exchange), gaps);
    if (!quote) throw new HttpError(404, 'SYMBOL_NOT_FOUND', `Could not find a market price for ${input.symbol} on ${input.exchange}. Check the symbol.`);
    const [history, indexHistory, fundamentals] = await Promise.all([
      safe('Price history', () => deps.market.getHistory(input.symbol, { range: '5y', exchange: input.exchange }), gaps),
      safe('NIFTY 50 history', () => deps.market.getHistory(INDEX_SYMBOL, { range: '5y' }), gaps),
      safe('Fundamentals', () => deps.fundamentals.getFundamentals(input.symbol, input.exchange), gaps),
    ]);
    const stats = history ? summarize(history.bars, indexHistory?.bars) : null;

    // Correlation with the largest current stock holdings.
    const top = [...position.positions].filter((p) => p.symbol && !p.diversified && p.symbol !== input.symbol)
      .sort((a, b) => b.equityValue - a.equityValue).slice(0, 6);
    const equityTotal = position.assets.equityExposure || 1;
    const peerHist = await Promise.all(top.map((p) => safe(`History ${p.symbol}`, async () => ({
      symbol: p.symbol, weightPct: round2((p.equityValue / equityTotal) * 100), bars: (await deps.market.getHistory(p.symbol, { range: '5y', exchange: p.exchange || 'NSE' })).bars,
    }), gaps)));
    const correlations = history ? correlationsWith(history.bars, peerHist.filter(Boolean)) : [];

    const sector = fundamentals?.sector || data.holdings.find((h) => h.symbol === input.symbol)?.sector || 'Unclassified';
    const decision = { kind: 'buy_stock', amount: input.amount, symbol: input.symbol, sector, name: fundamentals?.name || quote.name, fundFrom: input.fundFrom };
    const impact = evaluateDecision(position, decision);
    delete impact.scoreAfter;

    const checks = fitChecks({ position, impact, stats, fundamentals, amount: input.amount, liabilities: data.liabilities });
    const scenarios = scenarioTable(input.amount, stats, stats?.betaVsIndex);

    // Alternatives, evaluated with the same engine.
    const alternatives = [
      { id: 'do_nothing', title: 'Keep the money where it is', scoreDelta: 0, note: 'Preserves liquidity and current resilience.' },
      (() => { const a = evaluateDecision(position, { ...decision, amount: input.amount / 2 }); return { id: 'half', title: `Invest half (${formatINR(input.amount / 2)})`, scoreDelta: a.scoreDelta, note: 'Smaller position, smaller concentration and liquidity impact.' }; })(),
      (() => {
        const a = evaluateDecision(position, { ...decision, symbol: DIVERSIFIED_PROXY.symbol, sector: DIVERSIFIED_PROXY.sector, name: DIVERSIFIED_PROXY.name });
        return { id: 'index', title: `Same amount in a NIFTY 50 index fund/ETF (e.g. ${DIVERSIFIED_PROXY.symbol})`, scoreDelta: a.scoreDelta, note: 'Spreads company-specific risk across 50 large companies. Scored here as a single position for comparison.' };
      })(),
    ];
    const costly = data.liabilities.filter((l) => (l.interestRatePct ?? 0) >= 10 && l.outstanding > 0).sort((a, b) => b.interestRatePct - a.interestRatePct)[0];
    if (costly) alternatives.push({ id: 'prepay', title: `Prepay ${costly.name} (${costly.interestRatePct}% interest)`, scoreDelta: null, note: `A guaranteed saving of about ${costly.interestRatePct}% a year on the amount prepaid.` });

    // Research and family context (read-only).
    const { rows: concalls } = await db.query(
      `SELECT id, quarter, fiscal_year, created_at, analysis->'executiveSummary' AS summary, analysis->'quoteVerification' AS qv
       FROM concall_analyses WHERE user_id = $1 AND ticker = $2 ORDER BY created_at DESC LIMIT 3`, [userId, input.symbol]);
    const ctx = await safe('Family context', () => deps.memory.search(userId, `${input.symbol} ${fundamentals?.name || ''} ${sector} investment decision risk`, { scope: 'family', familyId, limit: 5 }), gaps);

    const facts = {
      request: { symbol: input.symbol, exchange: input.exchange, amount: input.amount, fundFrom: input.fundFrom, horizonYears: input.horizonYears, userNotes: input.notes || null },
      quote: { price: quote.currentPrice, asOf: quote.timestamp, freshness: quote.freshness, fiftyTwoWeekHigh: quote.fiftyTwoWeekHigh, fiftyTwoWeekLow: quote.fiftyTwoWeekLow },
      company: fundamentals && { name: fundamentals.name, sector: fundamentals.sector, industry: fundamentals.industry, summary: fundamentals.businessSummary, valuation: fundamentals.valuation, profitability: fundamentals.profitability, growth: fundamentals.growth, balanceSheet: fundamentals.balanceSheet, incomeHistory: fundamentals.incomeHistory },
      history: stats,
      family: {
        netWorth: position.netWorth, liquid: position.assets.liquid, equityExposure: position.assets.equityExposure,
        monthlySavings: position.cashflow.monthlySavings, essentialOutflows: position.cashflow.essentialOutflows,
        runwayIfIncomeStopsMonths: position.runway.ifIncomeStopsMonths,
      },
      impact: { before: impact.before, after: impact.after, scoreDelta: impact.scoreDelta, pillarDeltas: impact.pillarDeltas, diversification: impact.diversification, crash30: impact.stressTest },
      correlations, checks, scenarios, alternatives,
      research: concalls.map((c) => ({ quarter: `${c.quarter} ${c.fiscal_year}`, summary: c.summary, quotesVerified: c.qv })),
      familyContext: (ctx?.memories || []).filter((m) => m.text).map((m) => ({ text: m.text, person: m.person, date: m.date })),
      dataGaps: gaps,
    };

    // Optional AI narrative.
    let narrative = { status: 'not_requested' };
    const consent = await db.query("SELECT 1 FROM consents WHERE user_id = $1 AND scope = 'ai_analysis' AND revoked_at IS NULL", [userId]);
    if (!deps.llm.isConfigured()) narrative = { status: 'unavailable', reason: 'No AI provider is configured on the server.' };
    else if (!consent.rowCount) narrative = { status: 'consent_required', reason: 'Turn on "AI analysis of my finances" in Settings to get a written explanation.' };
    else {
      try {
        const { json, provider, model } = await deps.llm.generateJson(buildPrompt(facts), { system: SYSTEM, temperature: 0.2 });
        narrative = { status: 'ok', provider, model, ...sanitizeNarrative(json) };
      } catch (err) {
        narrative = { status: 'failed', reason: `AI narrative unavailable: ${err.message}` };
      }
    }

    const result = {
      id: randomUUID(),
      createdAt: new Date().toISOString(),
      overall: overallLevel(checks),
      facts,
      narrative,
      sources: [
        { label: 'Family records', detail: 'FinSight database, your view of the family', at: new Date().toISOString() },
        { label: 'Price', detail: `${quote.source || 'Yahoo Finance'} (${quote.freshness})`, at: quote.timestamp },
        ...(history ? [{ label: 'Price history (5y, adjusted)', detail: history.source, at: history.fetchedAt }] : []),
        ...(fundamentals ? [{ label: 'Fundamentals', detail: fundamentals.source, at: fundamentals.retrievedAt }] : []),
        ...concalls.map((c) => ({ label: `Concall analysis ${c.quarter} ${c.fiscal_year}`, detail: 'Your saved analysis', at: c.created_at })),
      ],
      disclaimer: 'Decision support, not investment advice. Historical ranges describe the past and do not predict future returns. FinSight does not place trades.',
    };
    await db.query('INSERT INTO agent_evaluations (id, family_id, user_id, symbol, exchange, amount, result) VALUES ($1,$2,$3,$4,$5,$6,$7)',
      [result.id, familyId, userId, input.symbol, input.exchange, input.amount, JSON.stringify(result)]);
    await audit({ familyId, actorId: userId, action: 'agent.evaluate', entityType: 'evaluation', entityId: result.id, details: { symbol: input.symbol, ai: narrative.status }, ip });
    await require('./activity').evaluation(userId, { symbol: input.symbol, amount: input.amount });
    return result;
  } catch (err) {
    await usage.release();
    throw err;
  }
}

const SYSTEM = `You are FinSight's investment analyst for Indian families. You explain whether a proposed stock purchase fits the family's whole financial position.
Rules:
- Use only the facts provided. Do not introduce numbers, news or events that are not in the facts. If something important is missing, say it is missing.
- Never guarantee or predict returns. Historical ranges describe the past only.
- You are decision support, not a SEBI-registered adviser. Do not tell the family to buy or sell; explain trade-offs.
- Always consider the option of not investing and the alternatives provided.
- Refer to facts by their keys, e.g. "history.oneYearReturnRange.p5", in "factsUsed".
Return one JSON object only.`;

function buildPrompt(facts) {
  return `FACTS (JSON):\n${JSON.stringify(facts)}\n\nReturn JSON with exactly these keys:
{
  "summary": "3-4 plain sentences on how this purchase fits the family's position",
  "rationale": ["up to 4 points for the investment, each grounded in the facts"],
  "keyRisks": ["up to 5 risks: company, valuation, concentration, liquidity, market"],
  "portfolioFit": "2 sentences on diversification, correlation and liquidity effects",
  "alternatives": "2 sentences comparing with the alternatives provided, including not investing",
  "uncertainty": "what is unknown or could make this analysis wrong",
  "questionsForFamily": ["2-3 questions the family should discuss before deciding"],
  "factsUsed": ["keys of the facts you relied on"]
}`;
}

function sanitizeNarrative(j) {
  const str = (v, n) => (typeof v === 'string' ? v.slice(0, n) : null);
  const arr = (v, k, n) => (Array.isArray(v) ? v.filter((x) => typeof x === 'string').slice(0, k).map((x) => x.slice(0, n)) : []);
  return {
    summary: str(j.summary, 1200), rationale: arr(j.rationale, 4, 400), keyRisks: arr(j.keyRisks, 5, 400),
    portfolioFit: str(j.portfolioFit, 800), alternatives: str(j.alternatives, 800), uncertainty: str(j.uncertainty, 800),
    questionsForFamily: arr(j.questionsForFamily, 3, 300), factsUsed: arr(j.factsUsed, 30, 120),
  };
}

async function list(familyId, userId) {
  await familyService.requireRole(familyId, userId, 'viewer');
  const { rows } = await db.query(
    `SELECT id, symbol, exchange, amount, created_at, result->>'overall' AS overall, result->'facts'->'impact'->>'scoreDelta' AS score_delta
     FROM agent_evaluations WHERE family_id = $1 AND user_id = $2 ORDER BY created_at DESC LIMIT 50`, [familyId, userId]);
  return rows.map((r) => ({ id: r.id, symbol: r.symbol, exchange: r.exchange, amount: r.amount, overall: r.overall, scoreDelta: r.score_delta === null ? null : Number(r.score_delta), createdAt: r.created_at }));
}

async function get(familyId, userId, id) {
  await familyService.requireRole(familyId, userId, 'viewer');
  if (!/^[0-9a-f-]{36}$/i.test(id)) throw new HttpError(404, 'NOT_FOUND', 'Evaluation not found.');
  const { rows } = await db.query('SELECT result FROM agent_evaluations WHERE id = $1 AND family_id = $2 AND user_id = $3', [id, familyId, userId]);
  if (!rows[0]) throw new HttpError(404, 'NOT_FOUND', 'Evaluation not found.');
  return rows[0].result;
}

module.exports = { evaluate, list, get, fitChecks, scenarioTable, overallLevel, inputSchema };
