const test = require('node:test');
const assert = require('node:assert/strict');
const zerodhaService = require('../services/zerodhaService');

test('Zerodha: Config check detects missing keys', () => {
  const prevKey = process.env.ZERODHA_API_KEY;
  const prevSecret = process.env.ZERODHA_API_SECRET;
  delete process.env.ZERODHA_API_KEY;
  delete process.env.ZERODHA_API_SECRET;

  try {
    assert.equal(zerodhaService.isConfigured(), false);
    assert.equal(zerodhaService.getLoginURL(), null);
  } finally {
    if (prevKey) process.env.ZERODHA_API_KEY = prevKey;
    if (prevSecret) process.env.ZERODHA_API_SECRET = prevSecret;
  }
});

test('Zerodha: Demo connect initializes sandbox portfolio cleanly', async () => {
  zerodhaService.disconnect();
  assert.equal(zerodhaService.isConnected(), false);

  const user = zerodhaService.connectDemoAccount();
  assert.ok(user);
  assert.equal(user.userId, 'ZD8492');
  assert.equal(zerodhaService.isConnected(), true);

  const portfolio = await zerodhaService.getPortfolio();
  assert.equal(portfolio.connected, true);
  assert.equal(portfolio.totalPortfolioValue, 500000);
  assert.equal(portfolio.holdingsCount, 4);

  // Weights sum to 100%
  const totalWeight = portfolio.holdings.reduce((sum, h) => sum + h.portfolioWeightPercent, 0);
  assert.ok(Math.abs(totalWeight - 100) < 0.5);

  // Disconnect
  zerodhaService.disconnect();
  assert.equal(zerodhaService.isConnected(), false);
});
