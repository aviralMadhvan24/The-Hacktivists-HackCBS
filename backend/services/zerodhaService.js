const crypto = require('crypto');

class ZerodhaService {
  constructor() {
    this.session = null;
    this.demoSession = null;
  }

  get apiKey() {
    return process.env.ZERODHA_API_KEY || '';
  }

  get apiSecret() {
    return process.env.ZERODHA_API_SECRET || '';
  }

  isConfigured() {
    return Boolean(this.apiKey && this.apiSecret);
  }

  isConnected() {
    return Boolean((this.session && this.session.accessToken) || this.demoSession);
  }

  getUser() {
    if (this.session) {
      return {
        userId: this.session.userId,
        userName: this.session.userName,
        broker: 'ZERODHA KITE',
        isDemo: false
      };
    }
    if (this.demoSession) {
      return {
        userId: this.demoSession.userId,
        userName: this.demoSession.userName,
        broker: 'ZERODHA KITE (Demo Sandbox)',
        isDemo: true
      };
    }
    return null;
  }

  /**
   * Generates the official Zerodha Kite Connect login URL.
   */
  getLoginURL() {
    if (!this.isConfigured()) {
      return null;
    }
    return `https://kite.zerodha.com/connect/login?v=3&api_key=${encodeURIComponent(this.apiKey)}`;
  }

  /**
   * Exchanges Kite request_token for access_token using SHA-256 checksum.
   * checksum = SHA256(api_key + request_token + api_secret)
   */
  async exchangeToken(requestToken) {
    if (!this.isConfigured()) {
      throw new Error('Zerodha API Key and Secret are not configured in backend/.env.');
    }
    if (!requestToken) {
      throw new Error('request_token is required for Kite session exchange.');
    }

    const hashInput = `${this.apiKey}${requestToken}${this.apiSecret}`;
    const checksum = crypto.createHash('sha256').update(hashInput).digest('hex');

    const params = new URLSearchParams();
    params.append('api_key', this.apiKey);
    params.append('request_token', requestToken);
    params.append('checksum', checksum);

    const response = await fetch('https://api.kite.trade/session/token', {
      method: 'POST',
      headers: {
        'X-Kite-Version': '3',
        'Content-Type': 'application/x-www-form-urlencoded'
      },
      body: params.toString()
    });

    const data = await response.json();
    if (!response.ok || data.status !== 'success') {
      throw new Error(data.message || 'Zerodha Kite token exchange failed.');
    }

    this.session = {
      userId: data.data.user_id,
      userName: data.data.user_name || data.data.user_id,
      accessToken: data.data.access_token,
      publicToken: data.data.public_token,
      connectedAt: new Date().toISOString()
    };
    this.demoSession = null;

    return this.getUser();
  }

  /**
   * Fetches holdings & margins from live Kite API.
   */
  async fetchLivePortfolio() {
    if (!this.session || !this.session.accessToken) {
      throw new Error('No active Zerodha Kite session.');
    }

    const headers = {
      'X-Kite-Version': '3',
      'Authorization': `token ${this.apiKey}:${this.session.accessToken}`
    };

    // 1. Fetch Holdings
    const holdingsRes = await fetch('https://api.kite.trade/portfolio/holdings', { headers });
    const holdingsData = await holdingsRes.json();
    if (!holdingsRes.ok || holdingsData.status !== 'success') {
      throw new Error(holdingsData.message || 'Failed to fetch Zerodha holdings.');
    }

    // 2. Fetch Available Cash Margins
    let availableCash = 0;
    try {
      const marginsRes = await fetch('https://api.kite.trade/user/margins/equity', { headers });
      const marginsData = await marginsRes.json();
      if (marginsRes.ok && marginsData.status === 'success' && marginsData.data) {
        availableCash = marginsData.data.net || marginsData.data.available?.cash || 0;
      }
    } catch (e) {
      console.warn('Could not fetch Zerodha equity margins:', e.message);
    }

    const rawHoldings = holdingsData.data || [];
    let totalPortfolioValue = 0;

    const holdings = rawHoldings.map(item => {
      const quantity = item.quantity || 0;
      const lastPrice = item.last_price || item.average_price || 0;
      const currentValue = quantity * lastPrice;
      totalPortfolioValue += currentValue;

      return {
        id: item.isin || `${item.tradingsymbol}-${quantity}`,
        companyName: item.company_name || this.guessCompanyName(item.tradingsymbol),
        ticker: item.tradingsymbol,
        sector: this.guessSector(item.tradingsymbol),
        currentValue: Math.round(currentValue),
        shares: quantity,
        averageBuyPrice: Math.round(item.average_price || 0),
        pnl: Math.round(item.pnl || 0),
        portfolioWeightPercent: 0 // calculated below
      };
    });

    // Calculate portfolio weight %
    if (totalPortfolioValue > 0) {
      holdings.forEach(h => {
        h.portfolioWeightPercent = parseFloat(((h.currentValue / totalPortfolioValue) * 100).toFixed(1));
      });
    }

    return {
      connected: true,
      broker: 'ZERODHA KITE',
      user: this.getUser(),
      totalPortfolioValue: Math.round(totalPortfolioValue),
      availableCash: Math.round(availableCash),
      holdingsCount: holdings.length,
      holdings
    };
  }

  /**
   * Connects a realistic Zerodha Demo sandbox account for testing.
   */
  connectDemoAccount() {
    this.demoSession = {
      userId: 'ZD8492',
      userName: 'Aviral Madhvan (Zerodha Kite)',
      connectedAt: new Date().toISOString()
    };
    this.session = null;
    return this.getUser();
  }

  /**
   * Returns portfolio data from either active live session or demo session.
   */
  async getPortfolio() {
    if (this.session) {
      return await this.fetchLivePortfolio();
    }
    if (this.demoSession) {
      return this.getDemoPortfolio();
    }
    throw new Error('No Zerodha account connected. Please connect your Zerodha Kite account.');
  }

  getDemoPortfolio() {
    const rawHoldings = [
      {
        companyName: 'Reliance Industries',
        ticker: 'RELIANCE',
        sector: 'Energy & Telecom',
        shares: 60,
        averageBuyPrice: 2850,
        currentValue: 175000
      },
      {
        companyName: 'Tata Consultancy Services',
        ticker: 'TCS',
        sector: 'Information Technology',
        shares: 38,
        averageBuyPrice: 3800,
        currentValue: 150000
      },
      {
        companyName: 'HDFC Bank',
        ticker: 'HDFCBANK',
        sector: 'Financial Services',
        shares: 62,
        averageBuyPrice: 1550,
        currentValue: 100000
      },
      {
        companyName: 'Infosys',
        ticker: 'INFY',
        sector: 'Information Technology',
        shares: 42,
        averageBuyPrice: 1720,
        currentValue: 75000
      }
    ];

    const totalPortfolioValue = rawHoldings.reduce((sum, h) => sum + h.currentValue, 0);

    const holdings = rawHoldings.map((h, i) => ({
      id: `demo-holding-${i + 1}`,
      ...h,
      portfolioWeightPercent: parseFloat(((h.currentValue / totalPortfolioValue) * 100).toFixed(1))
    }));

    return {
      connected: true,
      broker: 'ZERODHA KITE (Demo Sandbox)',
      user: this.getUser(),
      totalPortfolioValue,
      availableCash: 80000, // Matching liquid cash cushion
      holdingsCount: holdings.length,
      holdings
    };
  }

  disconnect() {
    this.session = null;
    this.demoSession = null;
    return true;
  }

  guessCompanyName(symbol) {
    const mapping = {
      'RELIANCE': 'Reliance Industries',
      'TCS': 'Tata Consultancy Services',
      'HDFCBANK': 'HDFC Bank',
      'INFY': 'Infosys',
      'TATAMOTORS': 'Tata Motors',
      'ICICIBANK': 'ICICI Bank',
      'BHARTIARTL': 'Bharti Airtel',
      'SBIN': 'State Bank of India',
      'LT': 'Larsen & Toubro',
      'ZOMATO': 'Zomato',
      'ITC': 'ITC Limited'
    };
    return mapping[symbol.toUpperCase()] || symbol;
  }

  guessSector(symbol) {
    const mapping = {
      'RELIANCE': 'Energy & Telecom',
      'TCS': 'Information Technology',
      'INFY': 'Information Technology',
      'HDFCBANK': 'Financial Services',
      'ICICIBANK': 'Financial Services',
      'SBIN': 'Banking',
      'TATAMOTORS': 'Automotive',
      'BHARTIARTL': 'Telecommunications',
      'LT': 'Infrastructure',
      'ZOMATO': 'Consumer Internet',
      'ITC': 'Consumer Goods'
    };
    return mapping[symbol.toUpperCase()] || 'Equity';
  }
}

module.exports = new ZerodhaService();
