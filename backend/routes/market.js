const express = require('express');
const { z } = require('zod');
const market = require('../services/marketData');
const families = require('../services/familyService');
const records = require('../services/recordsService');
const db = require('../db/pool');
const { wrap, validate, HttpError } = require('../lib/http');
const { audit } = require('../lib/audit');

const router = express.Router();

function marketError(err) {
  if (err instanceof HttpError) return err;
  const msg = err.message || '';
  if (msg.includes('RATE_LIMIT')) return new HttpError(429, 'MARKET_DATA_RATE_LIMIT', msg);
  if (msg.includes('not found') || msg.includes('No price history')) return new HttpError(404, 'SYMBOL_NOT_FOUND', msg);
  if (msg.includes('valid symbol') || msg.includes('Unsupported range')) return new HttpError(400, 'VALIDATION_ERROR', msg);
  return new HttpError(502, 'MARKET_DATA_UNAVAILABLE', `Market data is unavailable right now: ${msg}`);
}

router.get('/status', (req, res) => res.json({ success: true, status: market.getStatus() }));

router.get('/search', wrap(async (req, res) => {
  const q = String(req.query.q || '').slice(0, 60);
  if (!q.trim()) return res.json({ success: true, count: 0, results: [] });
  try {
    const results = await market.search(q);
    res.json({ success: true, count: results.length, results });
  } catch (err) { throw marketError(err); }
}));

router.get('/quote/:symbol', wrap(async (req, res) => {
  try {
    const exchange = req.query.exchange === 'BSE' ? 'BSE' : 'NSE';
    res.json({ success: true, quote: await market.getQuote(req.params.symbol, req.query.force === 'true', exchange) });
  } catch (err) { throw marketError(err); }
}));

router.post('/quotes', wrap(async (req, res) => {
  const { symbols, forceRefresh } = validate(z.object({ symbols: z.array(z.string().max(30)).min(1).max(100), forceRefresh: z.boolean().optional() }), req.body);
  res.json({ success: true, quotes: await market.getQuotes(symbols, Boolean(forceRefresh)) });
}));

router.get('/history/:symbol', wrap(async (req, res) => {
  try {
    const exchange = req.query.exchange === 'BSE' ? 'BSE' : 'NSE';
    res.json({ success: true, history: await market.getHistory(req.params.symbol, { range: String(req.query.range || '1y'), exchange }) });
  } catch (err) { throw marketError(err); }
}));

// GET /api/market/forecast/:symbol?horizon=20&exchange=NSE (metered)
router.get('/forecast/:symbol', wrap(async (req, res) => {
  const forecasts = require('../services/forecastService');
  const entitlements = require('../services/entitlements');
  const horizon = Number(req.query.horizon || 20);
  const exchange = req.query.exchange === 'BSE' ? 'BSE' : 'NSE';
  const usage = await entitlements.consume(req.user.id, 'forecast');
  try {
    res.json({ success: true, forecast: await forecasts.forecast(req.params.symbol, { exchange, horizon }) });
  } catch (err) {
    await usage.release();
    throw err;
  }
}));

router.get('/forecast-service/health', wrap(async (req, res) => {
  const forecasts = require('../services/forecastService');
  res.json({ success: true, service: await forecasts.health() });
}));

// Refreshes prices for every holding the user can edit in a family.
router.post('/refresh-holdings', wrap(async (req, res) => {
  const { familyId } = validate(z.object({ familyId: z.string().uuid() }).strict(), req.body);
  await families.requireRole(familyId, req.user.id, 'member');
  const accounts = (await records.listVisible('accounts', familyId, req.user.id)).filter((a) => a.valueSource !== 'manual');
  const ids = accounts.map((a) => a.id);
  if (!ids.length) return res.json({ success: true, updated: 0, failed: [] });
  const { rows } = await db.query(
    "SELECT id, symbol, exchange FROM holdings WHERE account_id = ANY($1::uuid[]) AND instrument IN ('equity','etf')", [ids]);
  const quotes = {};
  const failed = [];
  for (const h of rows) {
    const key = `${h.exchange}:${h.symbol}`;
    if (quotes[key]) continue;
    try { quotes[key] = await market.getQuote(h.symbol, false, h.exchange); } catch (err) { failed.push({ symbol: h.symbol, error: err.message }); }
  }
  const updated = await records.applyPrices(rows.map((h) => ({ id: h.id, symbol: `${h.exchange}:${h.symbol}` })), quotes);
  await audit({ familyId, actorId: req.user.id, action: 'holdings.price_refresh', details: { updated, failed: failed.length }, ip: req.ip });
  res.json({ success: true, updated, failed, source: market.getStatus().activeProvider });
}));

module.exports = router;
