const MarketDataAdapter = require('./MarketDataAdapter');

/**
 * Real Market Data Adapter querying Yahoo Finance for Indian Equities (.NS / .BO).
 * Strictly honors exchange delays: Free quotes on Indian equities carry a 15-minute
 * exchange delay, and are therefore explicitly classified as 'DELAYED_15MIN'.
 */
class YahooFinanceAdapter extends MarketDataAdapter {
  constructor() {
    super('Yahoo Finance (Delayed 15m)');
  }

  formatSymbol(symbol) {
    const s = (symbol || '').trim().toUpperCase();
    if (s.endsWith('.NS') || s.endsWith('.BO')) return s;
    return `${s}.NS`;
  }

  cleanSymbol(symbol) {
    return (symbol || '').trim().toUpperCase().replace('.NS', '').replace('.BO', '');
  }

  async search(query) {
    const q = (query || '').trim();
    if (!q) return [];

    const url = `https://query2.finance.yahoo.com/v1/finance/search?q=${encodeURIComponent(q)}&quotesCount=8&newsCount=0`;
    try {
      const res = await fetch(url, {
        headers: { 'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)' }
      });
      if (!res.ok) throw new Error(`Yahoo Search HTTP ${res.status}`);
      const data = await res.json();
      const quotes = data.quotes || [];

      return quotes
        .filter(item => (item.exchange === 'NSI' || item.exchange === 'BSE' || (item.symbol && item.symbol.includes('.NS'))))
        .map(item => ({
          symbol: this.cleanSymbol(item.symbol),
          name: item.shortname || item.longname || item.symbol,
          exchange: item.exchange === 'BSE' ? 'BSE' : 'NSE',
          sector: item.sector || 'Equity',
          type: 'EQUITY'
        }));
    } catch (err) {
      console.warn('Yahoo Search error:', err.message);
      return [];
    }
  }

  async getQuote(symbol) {
    const targetSymbol = this.formatSymbol(symbol);
    const cleanSym = this.cleanSymbol(symbol);
    const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(targetSymbol)}?interval=1d&range=2d`;

    const res = await fetch(url, {
      headers: { 'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)' }
    });

    if (res.status === 429) {
      throw new Error('MARKET_DATA_RATE_LIMIT: Yahoo Finance rate limit exceeded. Please retry in a few moments.');
    }
    if (!res.ok) {
      throw new Error(`MARKET_DATA_API_ERROR: Yahoo Finance responded with HTTP ${res.status}`);
    }

    const data = await res.json();
    const result = data.chart?.result?.[0];
    if (!result) {
      throw new Error(`Symbol '${cleanSym}' not found on NSE.`);
    }

    const meta = result.meta;
    const currentPrice = meta.regularMarketPrice;
    const previousClose = meta.chartPreviousClose || meta.previousClose || currentPrice;
    const change = Math.round((currentPrice - previousClose) * 100) / 100;
    const changePercent = previousClose > 0 ? Math.round((change / previousClose) * 10000) / 100 : 0;

    const marketTime = meta.regularMarketTime
      ? new Date(meta.regularMarketTime * 1000).toISOString()
      : new Date().toISOString();

    return {
      symbol: cleanSym,
      name: meta.shortName || meta.symbol || `${cleanSym} Limited`,
      exchange: meta.exchangeName === 'BSE' ? 'BSE' : 'NSE',
      currentPrice: Math.round(currentPrice * 100) / 100,
      previousClose: Math.round(previousClose * 100) / 100,
      change,
      changePercent,
      timestamp: marketTime,
      freshness: 'DELAYED_15MIN', // Strictly never labeled as live
      currency: meta.currency || 'INR'
    };
  }
}

module.exports = YahooFinanceAdapter;
