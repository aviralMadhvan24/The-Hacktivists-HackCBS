const test = require('node:test');
const assert = require('node:assert/strict');
const marketDataService = require('../services/marketData');
const MockMarketDataProvider = require('../services/marketData/MockMarketDataProvider');

test('Market Data Mock: Directory search returns relevant Indian equities', async () => {
  const provider = new MockMarketDataProvider();
  const results = await provider.search('Reliance');
  assert.ok(results.length >= 1);
  assert.equal(results[0].symbol, 'RELIANCE');
  assert.equal(results[0].exchange, 'NSE');
});

test('Market Data Mock: Returns quote with strict DEMO_DATA freshness tag', async () => {
  const provider = new MockMarketDataProvider();
  const quote = await provider.getQuote('RELIANCE');
  assert.equal(quote.symbol, 'RELIANCE');
  assert.equal(quote.exchange, 'NSE');
  assert.equal(quote.freshness, 'DEMO_DATA'); // Never labeled as live
  assert.ok(quote.currentPrice > 0);
  assert.ok(quote.previousClose > 0);
  assert.equal(typeof quote.change, 'number');
  assert.equal(typeof quote.changePercent, 'number');
});

test('Market Data Service: Cache returns cached item within TTL', async () => {
  marketDataService.clearCache();
  const q1 = await marketDataService.getQuote('TCS');
  assert.equal(q1.isFromCache, false);

  const q2 = await marketDataService.getQuote('TCS');
  assert.equal(q2.isFromCache, true);
  assert.equal(q1.currentPrice, q2.currentPrice);

  marketDataService.clearCache();
  const q3 = await marketDataService.getQuote('TCS');
  assert.equal(q3.isFromCache, false);
});

test('Market Data Service: Batch quotes returns quotes for all requested symbols', async () => {
  const symbols = ['RELIANCE', 'TCS', 'INFY', 'HDFCBANK'];
  const batch = await marketDataService.getQuotes(symbols);
  assert.equal(Object.keys(batch).length, 4);
  symbols.forEach(sym => {
    assert.ok(batch[sym]);
    assert.ok(batch[sym].currentPrice > 0);
  });
});
