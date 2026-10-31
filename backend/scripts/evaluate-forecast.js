// Backtests the forecast model on real NSE data across stocks and horizons.
// Usage: FORECAST_SERVICE_URL=http://127.0.0.1:8000 node scripts/evaluate-forecast.js [out.json]
const fs = require('fs');
const market = require('../services/marketData');

const SYMBOLS = ['RELIANCE', 'TCS', 'HDFCBANK', 'INFY', 'ICICIBANK', 'ITC', 'LT', 'BHARTIARTL'];
const HORIZONS = [5, 20, 60];
const base = (process.env.FORECAST_SERVICE_URL || 'http://127.0.0.1:8000').replace(/\/$/, '');

(async () => {
  const rows = [];
  for (const symbol of SYMBOLS) {
    const h = await market.getHistory(symbol, { range: '5y' });
    const values = h.bars.map((b) => b.adjClose);
    for (const horizon of HORIZONS) {
      const res = await fetch(`${base}/backtest`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ values, horizon, origins: 24 }) });
      const bt = await res.json();
      if (!res.ok) { console.log(symbol, horizon, 'ERROR', bt.detail); continue; }
      rows.push({ symbol, horizon, from: h.bars[0].date, to: h.bars[h.bars.length - 1].date, origins: bt.origins, modelMAPE: bt.modelMAPE, naiveMAPE: bt.naiveMAPE, skillVsNaivePct: bt.skillVsNaivePct, coverage80Pct: bt.coverage80Pct, directionHitRatePct: bt.directionHitRatePct });
      console.log(symbol, `h=${horizon}`, `MAPE ${bt.modelMAPE} vs naive ${bt.naiveMAPE}`, `skill ${bt.skillVsNaivePct}%`, `cov80 ${bt.coverage80Pct}%`, `dir ${bt.directionHitRatePct}%`);
    }
  }
  const summary = HORIZONS.map((horizon) => {
    const r = rows.filter((x) => x.horizon === horizon);
    const avg = (k) => Math.round((r.reduce((s, x) => s + x[k], 0) / r.length) * 100) / 100;
    return { horizon, stocks: r.length, avgModelMAPE: avg('modelMAPE'), avgNaiveMAPE: avg('naiveMAPE'), avgSkillVsNaivePct: avg('skillVsNaivePct'), avgCoverage80Pct: avg('coverage80Pct'), avgDirectionHitRatePct: avg('directionHitRatePct'), beatsNaive: r.filter((x) => x.skillVsNaivePct > 0).length };
  });
  console.log('\nSUMMARY'); console.table(summary);
  const out = process.argv[2];
  if (out) fs.writeFileSync(out, JSON.stringify({ generatedAt: new Date().toISOString(), model: 'amazon/chronos-bolt-small', method: 'Rolling-origin backtest, 24 origins per stock/horizon, log-price input, median vs actual close at horizon; naive = last observed close.', rows, summary }, null, 2));
})().catch((e) => { console.error(e); process.exit(1); });
