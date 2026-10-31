// Price forecasts via the Python forecast service (Chronos-Bolt).
// Inputs are real adjusted daily closes; outputs carry uncertainty bands, a
// backtest against a naive baseline, and explicit limitations.
const market = require('./marketData');
const { HttpError } = require('../lib/http');

const backtestCache = new Map(); // `${exchange}:${symbol}:${horizon}:${date}` → result

function serviceUrl() {
  return (process.env.FORECAST_SERVICE_URL || '').replace(/\/$/, '');
}

async function call(path, body) {
  const base = serviceUrl();
  if (!base) throw new HttpError(503, 'FORECAST_NOT_CONFIGURED', 'The forecasting service is not configured (FORECAST_SERVICE_URL).');
  let res;
  try {
    res = await fetch(`${base}${path}`, { method: body ? 'POST' : 'GET', headers: { 'Content-Type': 'application/json' }, body: body ? JSON.stringify(body) : undefined, signal: AbortSignal.timeout(120000) });
  } catch (err) {
    throw new HttpError(503, 'FORECAST_UNAVAILABLE', `The forecasting service is unreachable: ${err.message}`);
  }
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new HttpError(res.status === 422 ? 422 : 502, 'FORECAST_FAILED', json.detail ? String(json.detail) : `Forecast service HTTP ${res.status}`);
  return json;
}

/** Next n weekdays after a date (NSE holidays are not excluded — stated in limitations). */
function nextWeekdays(fromIso, n) {
  const out = [];
  const d = new Date(`${fromIso}T00:00:00Z`);
  while (out.length < n) {
    d.setUTCDate(d.getUTCDate() + 1);
    const wd = d.getUTCDay();
    if (wd !== 0 && wd !== 6) out.push(d.toISOString().slice(0, 10));
  }
  return out;
}

async function health() {
  return call('/health');
}

async function forecast(symbol, { exchange = 'NSE', horizon = 20 } = {}) {
  if (!Number.isInteger(horizon) || horizon < 1 || horizon > 64) throw new HttpError(400, 'VALIDATION_ERROR', 'horizon must be 1–64 trading days.');
  let history;
  try {
    history = await market.getHistory(symbol, { range: '5y', exchange });
  } catch (err) {
    throw new HttpError(/not found|No price history/i.test(err.message) ? 404 : 502, 'HISTORY_UNAVAILABLE', `Price history unavailable: ${err.message}`);
  }
  const bars = history.bars;
  if (bars.length < 260) throw new HttpError(422, 'INSUFFICIENT_HISTORY', `Only ${bars.length} trading days of history; at least 260 are needed.`);
  const values = bars.map((b) => b.adjClose);
  const lastDate = bars[bars.length - 1].date;

  const f = await call('/forecast', { values, horizon, quantiles: [0.1, 0.25, 0.5, 0.75, 0.9] });
  const dates = nextWeekdays(lastDate, horizon);
  const points = dates.map((date, i) => ({
    step: i + 1, date,
    p10: f.quantiles.p10[i], p25: f.quantiles.p25[i], p50: f.quantiles.p50[i], p75: f.quantiles.p75[i], p90: f.quantiles.p90[i],
  }));

  const key = `${exchange}:${history.symbol}:${horizon}:${lastDate}`;
  let bt = backtestCache.get(key);
  if (!bt) {
    bt = await call('/backtest', { values, horizon, origins: 12 }).catch((err) => ({ error: err.message }));
    if (!bt.error) {
      bt.rows = bt.rows.map((r) => ({ ...r, originDate: bars[r.originIndex - 1]?.date, targetDate: bars[r.originIndex + horizon - 1]?.date }));
      backtestCache.set(key, bt);
    }
  }

  const last = values[values.length - 1];
  const end = points[points.length - 1];
  return {
    symbol: history.symbol, exchange, name: history.name, currency: history.currency,
    model: { id: f.model, license: 'Apache-2.0', source: 'https://huggingface.co/amazon/chronos-bolt-small', contextDays: f.contextLength },
    history: bars.slice(-250).map((b) => ({ date: b.date, close: b.adjClose })),
    lastClose: { date: lastDate, value: last },
    forecast: points,
    summary: {
      horizonTradingDays: horizon,
      medianChangePct: Math.round((end.p50 / last - 1) * 10000) / 100,
      range80Pct: [Math.round((end.p10 / last - 1) * 10000) / 100, Math.round((end.p90 / last - 1) * 10000) / 100],
    },
    backtest: bt,
    dataSource: { prices: history.source, fetchedAt: history.fetchedAt, adjusted: 'Closes are adjusted for splits, bonuses and dividends.' },
    limitations: [
      'This is a statistical extrapolation of past prices. It does not know about results, news, policy or events.',
      'The shaded band is where the model expects the price 80% of the time; real outcomes fall outside it more often in turbulent markets. Check the backtest coverage.',
      'Dates are approximate trading days; NSE holidays are not excluded.',
      'Prices come from an unofficial, delayed source (Yahoo Finance).',
      'Not investment advice. Never treat the median line as a target or a guaranteed return.',
    ],
  };
}

module.exports = { forecast, health, nextWeekdays };
