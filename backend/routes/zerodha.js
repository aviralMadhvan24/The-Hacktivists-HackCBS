const express = require('express');
const zerodhaService = require('../services/zerodhaService');

const router = express.Router();

/**
 * GET /api/zerodha/status
 * Returns connection status and configuration state.
 */
router.get('/status', (req, res) => {
  const isConfigured = zerodhaService.isConfigured();
  const isConnected = zerodhaService.isConnected();
  const user = zerodhaService.getUser();

  res.status(200).json({
    success: true,
    isConfigured,
    isConnected,
    user,
    setupGuide: !isConfigured ? {
      info: 'To connect a real Zerodha account, create an app at https://developers.kite.trade/ and set ZERODHA_API_KEY and ZERODHA_API_SECRET in backend/.env.',
      redirectUrl: 'http://localhost:3000/api/zerodha/callback'
    } : null
  });
});

/**
 * GET /api/zerodha/login-url
 * Returns the Kite Connect OAuth login URL.
 */
router.get('/login-url', (req, res) => {
  if (!zerodhaService.isConfigured()) {
    return res.status(400).json({
      success: false,
      error: 'ZERODHA_NOT_CONFIGURED',
      message: 'ZERODHA_API_KEY and ZERODHA_API_SECRET are not set in backend/.env. Use /api/zerodha/demo-connect for instant sandbox testing or add your Kite credentials.'
    });
  }

  const loginUrl = zerodhaService.getLoginURL();
  res.status(200).json({
    success: true,
    loginUrl
  });
});

/**
 * GET /api/zerodha/callback
 * Zerodha Kite redirects back here after user signs in.
 */
router.get('/callback', async (req, res) => {
  const { request_token, status, action } = req.query;

  if (status !== 'success' || !request_token) {
    return res.status(400).send(`
      <html>
        <body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; text-align: center; padding: 50px;">
          <h2 style="color: #e53935;">Zerodha Authentication Failed</h2>
          <p>Request token was missing or status was unsuccessful.</p>
          <a href="finsight://zerodha-failed" style="display: inline-block; padding: 12px 24px; background: #2196f3; color: white; text-decoration: none; border-radius: 8px;">Return to FinSight</a>
        </body>
      </html>
    `);
  }

  try {
    const user = await zerodhaService.exchangeToken(request_token);

    return res.status(200).send(`
      <html>
        <body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; text-align: center; padding: 50px; background-color: #f8fafc;">
          <div style="max-width: 480px; margin: 0 auto; background: white; padding: 36px; border-radius: 16px; box-shadow: 0 4px 20px rgba(0,0,0,0.08);">
            <div style="font-size: 48px; margin-bottom: 12px;">✅</div>
            <h2 style="color: #0f172a; margin-bottom: 8px;">Zerodha Kite Connected!</h2>
            <p style="color: #64748b; margin-bottom: 24px;">Authenticated as <strong>${user.userName} (${user.userId})</strong>.</p>
            <p style="color: #334155; font-size: 14px;">Your portfolio holdings are now ready to sync with FinSight.</p>
            <div style="margin-top: 30px;">
              <a href="finsight://zerodha-success" style="display: inline-block; padding: 12px 28px; background: #ff5722; color: white; text-decoration: none; border-radius: 10px; font-weight: bold;">Return to App</a>
            </div>
          </div>
        </body>
      </html>
    `);
  } catch (err) {
    return res.status(500).send(`
      <html>
        <body style="font-family: -apple-system, BlinkMacSystemFont, sans-serif; text-align: center; padding: 50px;">
          <h2 style="color: #e53935;">Token Exchange Error</h2>
          <p>${err.message}</p>
        </body>
      </html>
    `);
  }
});

/**
 * POST /api/zerodha/exchange-token
 * Programmatic token exchange.
 */
router.post('/exchange-token', async (req, res) => {
  const { requestToken } = req.body;
  try {
    const user = await zerodhaService.exchangeToken(requestToken);
    res.status(200).json({ success: true, user });
  } catch (err) {
    res.status(400).json({ success: false, error: err.message });
  }
});

/**
 * POST /api/zerodha/demo-connect
 * Instantly connects a mock Zerodha sandbox session.
 */
router.post('/demo-connect', (req, res) => {
  const user = zerodhaService.connectDemoAccount();
  res.status(200).json({
    success: true,
    message: 'Connected to Zerodha Kite Demo Sandbox.',
    user
  });
});

/**
 * GET /api/zerodha/portfolio
 * Fetches holdings and available margins from active Zerodha session.
 */
router.get('/portfolio', async (req, res) => {
  try {
    const portfolio = await zerodhaService.getPortfolio();
    res.status(200).json({
      success: true,
      ...portfolio
    });
  } catch (err) {
    res.status(400).json({
      success: false,
      error: 'NO_SESSION',
      message: err.message
    });
  }
});

/**
 * POST /api/zerodha/disconnect
 * Logs out and clears the Zerodha session.
 */
router.post('/disconnect', (req, res) => {
  zerodhaService.disconnect();
  res.status(200).json({
    success: true,
    message: 'Zerodha Kite disconnected.'
  });
});

module.exports = router;
