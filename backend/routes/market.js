const express = require('express');
const marketDataService = require('../services/marketData');

const router = express.Router();

/**
 * GET /api/market/search?q=...
 */
router.get('/search', async (req, res) => {
  const query = req.query.q || req.query.query || '';
  if (!query || query.trim().length === 0) {
    return res.status(200).json({ success: true, count: 0, results: [] });
  }

  try {
    const results = await marketDataService.search(query);
    return res.status(200).json({
      success: true,
      count: results.length,
      results
    });
  } catch (err) {
    return res.status(500).json({
      success: false,
      error: 'SEARCH_ERROR',
      message: err.message
    });
  }
});

/**
 * GET /api/market/quote/:symbol
 */
router.get('/quote/:symbol', async (req, res) => {
  const symbol = req.params.symbol;
  const force = req.query.force === 'true';

  try {
    const quote = await marketDataService.getQuote(symbol, force);
    return res.status(200).json({
      success: true,
      quote
    });
  } catch (err) {
    const status = err.message && err.message.includes('RATE_LIMIT') ? 429 : 500;
    return res.status(status).json({
      success: false,
      error: 'QUOTE_ERROR',
      message: err.message
    });
  }
});

/**
 * POST /api/market/quotes
 * Batch quote endpoint for entire portfolio.
 */
router.post('/quotes', async (req, res) => {
  const { symbols, forceRefresh } = req.body;
  if (!symbols || !Array.isArray(symbols)) {
    return res.status(400).json({
      success: false,
      error: 'VALIDATION_ERROR',
      message: 'Body parameter "symbols" must be an array of strings.'
    });
  }

  try {
    const quotes = await marketDataService.getQuotes(symbols, Boolean(forceRefresh));
    return res.status(200).json({
      success: true,
      quotes
    });
  } catch (err) {
    return res.status(500).json({
      success: false,
      error: 'BATCH_QUOTES_ERROR',
      message: err.message
    });
  }
});

/**
 * POST /api/market/refresh
 * Clears cached quotes and returns status.
 */
router.post('/refresh', (req, res) => {
  marketDataService.clearCache();
  return res.status(200).json({
    success: true,
    message: 'Market data quote cache flushed.'
  });
});

/**
 * GET /api/market/status
 */
router.get('/status', (req, res) => {
  return res.status(200).json({
    success: true,
    status: marketDataService.getStatus()
  });
});

module.exports = router;
