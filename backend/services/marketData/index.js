const MockMarketDataProvider = require('./MockMarketDataProvider');
const YahooFinanceAdapter = require('./YahooFinanceAdapter');

class MarketDataService {
  constructor() {
    this.mockProvider = new MockMarketDataProvider();
    this.yahooProvider = new YahooFinanceAdapter();
    
    // In-memory quote cache: symbol -> { quote, cachedAt }
    this.cache = new Map();
    this.cacheTTLMs = 60 * 1000; // 60 seconds TTL to respect upstream rate limits
  }

  get providerMode() {
    return (process.env.MARKET_DATA_PROVIDER || 'YAHOO').toUpperCase();
  }

  getActiveProvider() {
    if (this.providerMode === 'MOCK') {
      return this.mockProvider;
    }
    // Default to Yahoo Finance with fallback to Mock if Yahoo fails or is blocked
    return this.yahooProvider;
  }

  async search(query) {
    const q = (query || '').trim();
    if (!q) return [];

    // First try active provider
    try {
      const results = await this.getActiveProvider().search(q);
      if (results && results.length > 0) return results;
    } catch (err) {
      console.warn(`Market search failed on ${this.providerMode}:`, err.message);
    }

    // Fallback to mock directory
    return await this.mockProvider.search(q);
  }

  async getQuote(symbol, forceRefresh = false) {
    const cleanSym = (symbol || '').trim().toUpperCase().replace('.NS', '').replace('.BO', '');
    if (!cleanSym) {
      throw new Error('Symbol is required.');
    }

    const now = Date.now();
    const cached = this.cache.get(cleanSym);

    if (!forceRefresh && cached && (now - cached.cachedAt) < this.cacheTTLMs) {
      return {
        ...cached.quote,
        isFromCache: true
      };
    }

    // Attempt active provider
    try {
      const quote = await this.getActiveProvider().getQuote(cleanSym);
      this.cache.set(cleanSym, { quote, cachedAt: now });
      return {
        ...quote,
        isFromCache: false
      };
    } catch (err) {
      // If cached stale data exists, return with STALE flag rather than failing
      if (cached) {
        return {
          ...cached.quote,
          freshness: 'STALE',
          staleWarning: `Failed to refresh live price: ${err.message}. Showing last known cached price.`,
          isFromCache: true
        };
      }

      // If in YAHOO mode and it fails (e.g. rate limit, offline sandbox), fall back to Mock with explicit DEMO_DATA label
      if (this.providerMode !== 'MOCK') {
        console.warn(`Provider ${this.providerMode} failed for ${cleanSym}, falling back to Demo provider:`, err.message);
        const demoQuote = await this.mockProvider.getQuote(cleanSym);
        demoQuote.demoReason = `Live market provider error (${err.message}). Showing DEMO DATA fallback.`;
        this.cache.set(cleanSym, { quote: demoQuote, cachedAt: now });
        return {
          ...demoQuote,
          isFromCache: false
        };
      }

      throw err;
    }
  }

  async getQuotes(symbols, forceRefresh = false) {
    const list = Array.isArray(symbols) ? symbols : [];
    const results = {};
    for (const sym of list) {
      try {
        results[sym] = await this.getQuote(sym, forceRefresh);
      } catch (err) {
        results[sym] = {
          symbol: sym,
          error: err.message,
          freshness: 'UNAVAILABLE'
        };
      }
    }
    return results;
  }

  clearCache() {
    this.cache.clear();
    return true;
  }

  getStatus() {
    return {
      activeProvider: this.providerMode === 'MOCK' ? this.mockProvider.name : this.yahooProvider.name,
      configuredMode: this.providerMode,
      cacheSize: this.cache.size,
      cacheTTLSeconds: this.cacheTTLMs / 1000
    };
  }
}

module.exports = new MarketDataService();
