const MarketDataAdapter = require('./MarketDataAdapter');

/**
 * Yahoo Finance public chart API for Indian equities (.NS / .BO).
 * Unofficial: no SLA, may rate-limit or change. Free NSE/BSE quotes are
 * delayed (~15 min), so they are labelled DELAYED_15MIN, never real-time.
 */
const UA = { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)' };
const RANGES = new Set(['1mo', '3mo', '6mo', '1y', '2y', '5y', '10y', 'max']);

class YahooFinanceAdapter extends MarketDataAdapter {
  constructor() {
    super('Yahoo Finance (delayed ~15 min)');
  }

  formatSymbol(symbol, exchange = 'NSE') {
    const s = (symbol || '').trim().toUpperCase();
    if (s.endsWith('.NS') || s.endsWith('.BO')) return s;
    return `${s}${exchange === 'BSE' ? '.BO' : '.NS'}`;
  }

  cleanSymbol(symbol) {
    return (symbol || '').trim().toUpperCase().replace(/\.(NS|BO)$/, '');
  }

  async fetchJson(url) {
    let res;
    try {
      res = await fetch(url, { headers: UA, signal: AbortSignal.timeout(12000) });
    } catch (err) {
      throw new Error(`MARKET_DATA_UNREACHABLE: ${err.message}`);
    }
    if (res.status === 429) throw new Error('MARKET_DATA_RATE_LIMIT: Yahoo Finance rate limit exceeded. Please retry shortly.');
    if (res.status === 404) throw new Error('Symbol not found.');
    if (!res.ok) throw new Error(`MARKET_DATA_API_ERROR: Yahoo Finance responded with HTTP ${res.status}`);
    return res.json();
  }

  async search(query) {
    const q = (query || '').trim();
    if (!q) return [];
    const data = await this.fetchJson(`https://query2.finance.yahoo.com/v1/finance/search?q=${encodeURIComponent(q)}&quotesCount=10&newsCount=0`);
    return (data.quotes || [])
      .filter((item) => item.symbol && (item.symbol.endsWith('.NS') || item.symbol.endsWith('.BO')))
      .map((item) => ({
        symbol: this.cleanSymbol(item.symbol),
        name: item.longname || item.shortname || item.symbol,
        exchange: item.symbol.endsWith('.BO') ? 'BSE' : 'NSE',
        sector: item.sectorDisp || item.sector || null,
        industry: item.industryDisp || item.industry || null,
        type: item.quoteType || 'EQUITY',
      }));
  }

  async getQuote(symbol, exchange = 'NSE') {
    const target = this.formatSymbol(symbol, exchange);
    const data = await this.fetchJson(`https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(target)}?interval=1d&range=5d`);
    const result = data.chart?.result?.[0];
    if (!result) throw new Error(`Symbol '${this.cleanSymbol(symbol)}' not found on ${exchange}.`);
    const meta = result.meta;
    const currentPrice = meta.regularMarketPrice;
    const closes = (result.indicators?.quote?.[0]?.close || []).filter((v) => v != null);
    // chartPreviousClose is the close before the 5d window; use the prior session's close instead.
    const previousClose = closes.length >= 2 ? closes[closes.length - 2] : (meta.chartPreviousClose || currentPrice);
    const change = Math.round((currentPrice - previousClose) * 100) / 100;
    return {
      symbol: this.cleanSymbol(symbol),
      name: meta.longName || meta.shortName || meta.symbol,
      exchange: meta.exchangeName === 'BSE' ? 'BSE' : 'NSE',
      currentPrice: Math.round(currentPrice * 100) / 100,
      previousClose: Math.round(previousClose * 100) / 100,
      change,
      changePercent: previousClose > 0 ? Math.round((change / previousClose) * 10000) / 100 : 0,
      fiftyTwoWeekHigh: meta.fiftyTwoWeekHigh ?? null,
      fiftyTwoWeekLow: meta.fiftyTwoWeekLow ?? null,
      timestamp: meta.regularMarketTime ? new Date(meta.regularMarketTime * 1000).toISOString() : new Date().toISOString(),
      freshness: 'DELAYED_15MIN',
      currency: meta.currency || 'INR',
    };
  }

  /** Daily bars. `adjClose` is adjusted for splits/bonuses/dividends. */
  async getHistory(symbol, { range = '5y', exchange = 'NSE' } = {}) {
    if (!RANGES.has(range)) throw new Error(`Unsupported range ${range}.`);
    const target = this.formatSymbol(symbol, exchange);
    const data = await this.fetchJson(`https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(target)}?interval=1d&range=${range}&events=div%2Csplits`);
    const result = data.chart?.result?.[0];
    if (!result || !result.timestamp) throw new Error(`No price history for '${this.cleanSymbol(symbol)}' on ${exchange}.`);
    const q = result.indicators.quote[0];
    const adj = result.indicators.adjclose?.[0]?.adjclose || q.close;
    const bars = [];
    for (let i = 0; i < result.timestamp.length; i++) {
      if (q.close[i] == null || adj[i] == null) continue; // holidays / missing sessions
      // Bars are stamped at market open in IST; shift +5:30 to get the IST trading date.
      const date = new Date((result.timestamp[i] + 19800) * 1000).toISOString().slice(0, 10);
      bars.push({ date, open: q.open[i], high: q.high[i], low: q.low[i], close: q.close[i], adjClose: adj[i], volume: q.volume[i] });
    }
    const splits = Object.values(result.events?.splits || {}).map((s) => ({ date: new Date((s.date + 19800) * 1000).toISOString().slice(0, 10), ratio: `${s.numerator}:${s.denominator}` }));
    const dividends = Object.values(result.events?.dividends || {}).map((d) => ({ date: new Date((d.date + 19800) * 1000).toISOString().slice(0, 10), amount: d.amount }));
    return {
      symbol: this.cleanSymbol(symbol), exchange, currency: result.meta.currency || 'INR',
      name: result.meta.longName || result.meta.shortName || null,
      source: this.name, fetchedAt: new Date().toISOString(),
      bars, corporateActions: { splits, dividends },
    };
  }
}

module.exports = YahooFinanceAdapter;
