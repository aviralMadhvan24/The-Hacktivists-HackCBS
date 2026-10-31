// Market data service with caching and explicit freshness labels.
//
// Providers: Yahoo Finance chart API (default, unofficial, ~15-min delayed for
// NSE/BSE) or MOCK (demo data, only when MARKET_DATA_PROVIDER=MOCK).
// When the live provider fails we return the last cached value marked STALE,
// or an error. We never silently substitute demo prices.
const MockMarketDataProvider = require('./MockMarketDataProvider');
const YahooFinanceAdapter = require('./YahooFinanceAdapter');

class MarketDataService {
  constructor() {
    this.mockProvider = new MockMarketDataProvider();
    this.yahooProvider = new YahooFinanceAdapter();
    this.cache = new Map(); // symbol -> { quote, cachedAt }
    this.historyCache = new Map(); // key -> { data, cachedAt }
    this.cacheTTLMs = 60 * 1000;
    this.historyTTLMs = 6 * 60 * 60 * 1000;
  }

  get providerMode() {
    return (process.env.MARKET_DATA_PROVIDER || 'YAHOO').toUpperCase();
  }

  getActiveProvider() {
    return this.providerMode === 'MOCK' ? this.mockProvider : this.yahooProvider;
  }

  cleanSymbol(symbol) {
    return (symbol || '').trim().toUpperCase().replace(/\.(NS|BO)$/, '');
  }

  async search(query) {
    const q = (query || '').trim();
    if (!q) return [];
    return this.getActiveProvider().search(q);
  }

  async getQuote(symbol, forceRefresh = false, exchange = 'NSE') {
    const cleanSym = this.cleanSymbol(symbol);
    if (!cleanSym || !/^[A-Z0-9&\-_.]{1,30}$/.test(cleanSym)) throw new Error('A valid symbol is required.');
    const key = `${exchange}:${cleanSym}`;
    const now = Date.now();
    const cached = this.cache.get(key);
    if (!forceRefresh && cached && now - cached.cachedAt < this.cacheTTLMs) return { ...cached.quote, isFromCache: true };

    try {
      const quote = await this.getActiveProvider().getQuote(cleanSym, exchange);
      quote.source = this.getActiveProvider().name;
      this.cache.set(key, { quote, cachedAt: now });
      return { ...quote, isFromCache: false };
    } catch (err) {
      if (cached) {
        return { ...cached.quote, freshness: 'STALE', staleWarning: `Could not refresh: ${err.message}. Showing the last fetched price.`, isFromCache: true };
      }
      throw err;
    }
  }

  async getQuotes(symbols, forceRefresh = false) {
    const results = {};
    for (const sym of Array.isArray(symbols) ? symbols.slice(0, 100) : []) {
      try {
        results[sym] = await this.getQuote(sym, forceRefresh);
      } catch (err) {
        results[sym] = { symbol: sym, error: err.message, freshness: 'UNAVAILABLE' };
      }
    }
    return results;
  }

  /** Daily OHLC history. range: 1mo..10y. */
  async getHistory(symbol, { range = '5y', exchange = 'NSE' } = {}) {
    const cleanSym = this.cleanSymbol(symbol);
    const key = `${exchange}:${cleanSym}:${range}`;
    const cached = this.historyCache.get(key);
    if (cached && Date.now() - cached.cachedAt < this.historyTTLMs) return cached.data;
    if (this.providerMode === 'MOCK') throw new Error('Price history is not available in MOCK mode.');
    const data = await this.yahooProvider.getHistory(cleanSym, { range, exchange });
    this.historyCache.set(key, { data, cachedAt: Date.now() });
    return data;
  }

  clearCache() {
    this.cache.clear();
    this.historyCache.clear();
    return true;
  }

  getStatus() {
    return {
      activeProvider: this.getActiveProvider().name,
      configuredMode: this.providerMode,
      isDemoData: this.providerMode === 'MOCK',
      cacheSize: this.cache.size,
      cacheTTLSeconds: this.cacheTTLMs / 1000,
      limitations: this.providerMode === 'MOCK'
        ? 'Demo prices only. Not real market data.'
        : 'Yahoo Finance public chart endpoint: unofficial, no SLA, ~15 minute delay for NSE/BSE, may rate-limit. Suitable for development and personal use; use a licensed feed for production.',
    };
  }
}

module.exports = new MarketDataService();
