/**
 * Abstract Base Class for Market Data Providers.
 * Enables switching providers (e.g. Yahoo Finance, Kite, AlphaVantage, Mock)
 * without rewriting portfolio or valuation logic.
 */
class MarketDataAdapter {
  constructor(name) {
    this.name = name;
  }

  /**
   * Search for symbols matching a keyword.
   * @param {string} query
   * @returns {Promise<Array<{symbol: string, name: string, exchange: string, type: string}>>}
   */
  async search(query) {
    throw new Error('Method search() must be implemented.');
  }

  /**
   * Fetch quote for a single symbol.
   * @param {string} symbol
   * @returns {Promise<{
   *   symbol: string,
   *   name: string,
   *   exchange: string,
   *   currentPrice: number,
   *   previousClose: number,
   *   change: number,
   *   changePercent: number,
   *   timestamp: string,
   *   freshness: 'REALTIME' | 'DELAYED_15MIN' | 'END_OF_DAY' | 'DEMO_DATA',
   *   currency: string
   * }>}
   */
  async getQuote(symbol) {
    throw new Error('Method getQuote() must be implemented.');
  }

  /**
   * Fetch batch quotes.
   * @param {string[]} symbols
   * @returns {Promise<Record<string, object>>}
   */
  async getQuotes(symbols) {
    const results = {};
    for (const sym of symbols) {
      try {
        results[sym] = await this.getQuote(sym);
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
}

module.exports = MarketDataAdapter;
