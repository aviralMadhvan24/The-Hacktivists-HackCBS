// Historical risk statistics from daily adjusted closes. Pure and deterministic.
// These describe the past; they are not forecasts.

const { round2 } = require('./money');

const TRADING_DAYS = 252;

function toReturns(bars) {
  const out = [];
  for (let i = 1; i < bars.length; i++) {
    const a = bars[i - 1].adjClose; const b = bars[i].adjClose;
    if (a > 0 && b > 0) out.push({ date: bars[i].date, r: b / a - 1 });
  }
  return out;
}

function mean(xs) { return xs.reduce((s, x) => s + x, 0) / xs.length; }
function stdev(xs) {
  if (xs.length < 2) return 0;
  const m = mean(xs);
  return Math.sqrt(xs.reduce((s, x) => s + (x - m) ** 2, 0) / (xs.length - 1));
}

/** Percentile with linear interpolation, p in [0, 100]. */
function percentile(sorted, p) {
  if (!sorted.length) return null;
  const idx = (p / 100) * (sorted.length - 1);
  const lo = Math.floor(idx); const hi = Math.ceil(idx);
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (idx - lo);
}

function maxDrawdown(bars) {
  let peak = -Infinity; let mdd = 0; let peakDate = null; let trough = null; let worst = null;
  for (const b of bars) {
    if (b.adjClose > peak) { peak = b.adjClose; peakDate = b.date; }
    const dd = b.adjClose / peak - 1;
    if (dd < mdd) { mdd = dd; trough = b.date; worst = { from: peakDate, to: trough }; }
  }
  return { maxDrawdownPct: round2(mdd * 100), period: worst };
}

/** Rolling N-day returns (overlapping windows) — the empirical range of outcomes. */
function rollingReturns(bars, days = TRADING_DAYS) {
  const out = [];
  for (let i = days; i < bars.length; i++) out.push(bars[i].adjClose / bars[i - days].adjClose - 1);
  return out;
}

/** Aligns two return series on date. */
function align(a, b) {
  const m = new Map(b.map((x) => [x.date, x.r]));
  const xs = []; const ys = [];
  for (const x of a) if (m.has(x.date)) { xs.push(x.r); ys.push(m.get(x.date)); }
  return { xs, ys };
}

function correlation(xs, ys) {
  if (xs.length < 30) return null;
  const mx = mean(xs); const my = mean(ys);
  let num = 0; let dx = 0; let dy = 0;
  for (let i = 0; i < xs.length; i++) { num += (xs[i] - mx) * (ys[i] - my); dx += (xs[i] - mx) ** 2; dy += (ys[i] - my) ** 2; }
  return dx && dy ? num / Math.sqrt(dx * dy) : null;
}

function beta(stockRets, indexRets) {
  const { xs, ys } = align(stockRets, indexRets);
  if (xs.length < 60) return null;
  const mx = mean(xs); const my = mean(ys);
  let cov = 0; let varI = 0;
  for (let i = 0; i < xs.length; i++) { cov += (xs[i] - mx) * (ys[i] - my); varI += (ys[i] - my) ** 2; }
  return varI ? cov / varI : null;
}

/**
 * Summary statistics for one instrument.
 * @param {{date:string, adjClose:number}[]} bars ascending
 * @param {{date:string, adjClose:number}[]} [indexBars] benchmark (e.g. NIFTY 50)
 */
function summarize(bars, indexBars) {
  if (!bars || bars.length < 30) return { insufficientData: true, observations: bars ? bars.length : 0 };
  const rets = toReturns(bars);
  const daily = rets.map((x) => x.r);
  const years = (new Date(bars[bars.length - 1].date) - new Date(bars[0].date)) / (365.25 * 86400000);
  const total = bars[bars.length - 1].adjClose / bars[0].adjClose;
  const last = (days) => (bars.length > days ? round2((bars[bars.length - 1].adjClose / bars[bars.length - 1 - days].adjClose - 1) * 100) : null);
  const roll = rollingReturns(bars).sort((a, b) => a - b);
  const idxRets = indexBars && indexBars.length > 30 ? toReturns(indexBars) : null;
  const { xs, ys } = idxRets ? align(rets, idxRets) : { xs: [], ys: [] };
  return {
    from: bars[0].date,
    to: bars[bars.length - 1].date,
    observations: bars.length,
    annualizedVolatilityPct: round2(stdev(daily) * Math.sqrt(TRADING_DAYS) * 100),
    cagrPct: years > 0.5 ? round2((total ** (1 / years) - 1) * 100) : null,
    return1mPct: last(21),
    return1yPct: last(TRADING_DAYS),
    return3yPct: last(TRADING_DAYS * 3),
    ...maxDrawdown(bars),
    worstDayPct: round2(Math.min(...daily) * 100),
    oneYearReturnRange: roll.length >= 20 ? {
      windows: roll.length,
      p5: round2(percentile(roll, 5) * 100), p25: round2(percentile(roll, 25) * 100), median: round2(percentile(roll, 50) * 100),
      p75: round2(percentile(roll, 75) * 100), p95: round2(percentile(roll, 95) * 100),
      worst: round2(roll[0] * 100), best: round2(roll[roll.length - 1] * 100),
      shareNegativePct: round2((roll.filter((r) => r < 0).length / roll.length) * 100),
    } : null,
    betaVsIndex: idxRets ? (beta(rets, idxRets) === null ? null : round2(beta(rets, idxRets))) : null,
    correlationWithIndex: idxRets ? (correlation(xs, ys) === null ? null : round2(correlation(xs, ys))) : null,
  };
}

/** Correlation of the candidate with each existing holding (daily returns). */
function correlationsWith(candidateBars, others) {
  const c = toReturns(candidateBars);
  return others.map(({ symbol, bars, weightPct }) => {
    const { xs, ys } = align(c, toReturns(bars));
    const v = correlation(xs, ys);
    return { symbol, weightPct, correlation: v === null ? null : round2(v), overlapDays: xs.length };
  }).sort((a, b) => (b.correlation ?? -2) - (a.correlation ?? -2));
}

module.exports = { summarize, correlationsWith, toReturns, percentile, maxDrawdown, rollingReturns, correlation, beta, stdev };
