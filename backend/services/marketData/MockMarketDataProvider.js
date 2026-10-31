const MarketDataAdapter = require('./MarketDataAdapter');

/**
 * High-fidelity Indian equities mock market data provider.
 * All prices are explicitly tagged with freshness: 'DEMO_DATA'.
 */
class MockMarketDataProvider extends MarketDataAdapter {
  constructor() {
    super('Mock Indian Equities Provider (DEMO DATA)');
    this.directory = {
      'RELIANCE': {
        name: 'Reliance Industries Limited',
        exchange: 'NSE',
        price: 2916.65,
        prevClose: 2890.00,
        sector: 'Energy & Telecom'
      },
      'TCS': {
        name: 'Tata Consultancy Services Limited',
        exchange: 'NSE',
        price: 3942.10,
        prevClose: 3915.50,
        sector: 'Information Technology'
      },
      'INFY': {
        name: 'Infosys Limited',
        exchange: 'NSE',
        price: 1784.50,
        prevClose: 1792.00,
        sector: 'Information Technology'
      },
      'HDFCBANK': {
        name: 'HDFC Bank Limited',
        exchange: 'NSE',
        price: 1612.30,
        prevClose: 1604.80,
        sector: 'Financial Services'
      },
      'ICICIBANK': {
        name: 'ICICI Bank Limited',
        exchange: 'NSE',
        price: 1245.80,
        prevClose: 1238.10,
        sector: 'Financial Services'
      },
      'TATAMOTORS': {
        name: 'Tata Motors Limited',
        exchange: 'NSE',
        price: 980.40,
        prevClose: 972.25,
        sector: 'Automotive'
      },
      'BHARTIARTL': {
        name: 'Bharti Airtel Limited',
        exchange: 'NSE',
        price: 1682.00,
        prevClose: 1670.50,
        sector: 'Telecommunications'
      },
      'SBIN': {
        name: 'State Bank of India',
        exchange: 'NSE',
        price: 812.50,
        prevClose: 816.00,
        sector: 'Banking'
      },
      'LT': {
        name: 'Larsen & Toubro Limited',
        exchange: 'NSE',
        price: 3520.00,
        prevClose: 3504.00,
        sector: 'Infrastructure'
      },
      'ZOMATO': {
        name: 'Zomato Limited',
        exchange: 'NSE',
        price: 254.20,
        prevClose: 248.60,
        sector: 'Consumer Internet'
      },
      'ITC': {
        name: 'ITC Limited',
        exchange: 'NSE',
        price: 478.90,
        prevClose: 476.20,
        sector: 'Consumer Goods'
      },
      'TATAPOWER': {
        name: 'Tata Power Company Limited',
        exchange: 'NSE',
        price: 438.50,
        prevClose: 432.10,
        sector: 'Power & Utilities'
      },
      'SUZLON': {
        name: 'Suzlon Energy Limited',
        exchange: 'NSE',
        price: 72.80,
        prevClose: 70.90,
        sector: 'Renewable Energy'
      },
      'JIOFIN': {
        name: 'Jio Financial Services Limited',
        exchange: 'NSE',
        price: 332.50,
        prevClose: 328.00,
        sector: 'Financial Services'
      },
      'IRFC': {
        name: 'Indian Railway Finance Corporation',
        exchange: 'NSE',
        price: 168.20,
        prevClose: 165.40,
        sector: 'Railways & Finance'
      },
      'HAL': {
        name: 'Hindustan Aeronautics Limited',
        exchange: 'NSE',
        price: 4560.00,
        prevClose: 4510.00,
        sector: 'Aerospace & Defense'
      },
      'BEL': {
        name: 'Bharat Electronics Limited',
        exchange: 'NSE',
        price: 284.00,
        prevClose: 281.50,
        sector: 'Defense Electronics'
      },
      'CDSL': {
        name: 'Central Depository Services Limited',
        exchange: 'BSE',
        price: 1480.00,
        prevClose: 1465.00,
        sector: 'Capital Markets'
      },
      'BSE': {
        name: 'BSE Limited',
        exchange: 'BSE',
        price: 4620.00,
        prevClose: 4550.00,
        sector: 'Stock Exchange'
      },
      'KOTAKBANK': {
        name: 'Kotak Mahindra Bank Limited',
        exchange: 'NSE',
        price: 1756.20,
        prevClose: 1748.00,
        sector: 'Banking'
      },
      'AXISBANK': {
        name: 'Axis Bank Limited',
        exchange: 'NSE',
        price: 1184.00,
        prevClose: 1176.50,
        sector: 'Banking'
      },
      'MARUTI': {
        name: 'Maruti Suzuki India Limited',
        exchange: 'NSE',
        price: 12150.00,
        prevClose: 12050.00,
        sector: 'Automotive'
      },
      'TITAN': {
        name: 'Titan Company Limited',
        exchange: 'NSE',
        price: 3420.00,
        prevClose: 3390.00,
        sector: 'Consumer Discretionary'
      },
      'BAJFINANCE': {
        name: 'Bajaj Finance Limited',
        exchange: 'NSE',
        price: 7120.00,
        prevClose: 7060.00,
        sector: 'Financial Services'
      },
      'TRENT': {
        name: 'Trent Limited (Westside/Zudio)',
        exchange: 'NSE',
        price: 7450.00,
        prevClose: 7380.00,
        sector: 'Retail'
      },
      'WIPRO': {
        name: 'Wipro Limited',
        exchange: 'NSE',
        price: 538.00,
        prevClose: 534.20,
        sector: 'Information Technology'
      }
    };
  }

  async search(query) {
    const q = (query || '').trim().toUpperCase();
    if (!q) return [];

    return Object.entries(this.directory)
      .filter(([symbol, data]) => symbol.includes(q) || data.name.toUpperCase().includes(q))
      .map(([symbol, data]) => ({
        symbol,
        name: data.name,
        exchange: data.exchange,
        sector: data.sector,
        type: 'EQUITY'
      }));
  }

  async getQuote(symbol) {
    const cleanSym = (symbol || '').trim().toUpperCase().replace('.NS', '').replace('.BO', '');
    const data = this.directory[cleanSym];

    if (!data) {
      // Deterministic fallback for unlisted symbols in demo mode
      const hash = cleanSym.split('').reduce((acc, c) => acc + c.charCodeAt(0), 0);
      const synthPrice = 500 + (hash % 1500);
      const synthPrev = synthPrice * 0.99;
      return {
        symbol: cleanSym,
        name: `${cleanSym} Limited`,
        exchange: 'NSE',
        currentPrice: Math.round(synthPrice * 100) / 100,
        previousClose: Math.round(synthPrev * 100) / 100,
        change: Math.round((synthPrice - synthPrev) * 100) / 100,
        changePercent: Math.round(((synthPrice - synthPrev) / synthPrev) * 10000) / 100,
        timestamp: new Date().toISOString(),
        freshness: 'DEMO_DATA',
        currency: 'INR'
      };
    }

    const change = Math.round((data.price - data.prevClose) * 100) / 100;
    const changePercent = Math.round((change / data.prevClose) * 10000) / 100;

    return {
      symbol: cleanSym,
      name: data.name,
      exchange: data.exchange,
      currentPrice: data.price,
      previousClose: data.prevClose,
      change,
      changePercent,
      timestamp: new Date().toISOString(),
      freshness: 'DEMO_DATA',
      currency: 'INR'
    };
  }
}

module.exports = MockMarketDataProvider;
