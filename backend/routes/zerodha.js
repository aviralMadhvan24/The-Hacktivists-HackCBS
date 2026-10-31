const express = require('express');
const zerodha = require('../services/zerodhaService');
const { requireAuth } = require('../middleware/auth');
const { wrap } = require('../lib/http');

const router = express.Router();
const webUrl = (query) => `${(process.env.WEB_APP_URL || '').replace(/\/$/, '')}/settings?${query}`;

router.get('/status', requireAuth, wrap(async (req, res) => res.json({ success: true, ...(await zerodha.status(req.user.id)) })));

router.get('/login-url', requireAuth, wrap(async (req, res) => res.json({ success: true, loginUrl: await zerodha.createLoginUrl(req.user.id) })));

// Public: Kite redirects the browser here. The one-time state identifies the user.
// Redirects back to the web app; no user-controlled text is rendered.
router.get('/callback', async (req, res) => {
  try {
    await zerodha.handleCallback({ requestToken: req.query.request_token, state: req.query.state, status: req.query.status });
    res.redirect(302, webUrl('zerodha=connected'));
  } catch (err) {
    const code = encodeURIComponent(err.code || 'ZERODHA_ERROR');
    res.redirect(302, webUrl(`zerodha=error&code=${code}`));
  }
});

router.get('/portfolio', requireAuth, wrap(async (req, res) => res.json({ success: true, ...(await zerodha.fetchPortfolio(req.user.id)) })));

router.post('/sync', requireAuth, wrap(async (req, res) => res.json({ success: true, ...(await zerodha.syncToFamily(req.user.id, req.body || {}, req.ip)) })));

router.post('/disconnect', requireAuth, wrap(async (req, res) => { await zerodha.disconnect(req.user.id, req.ip); res.json({ success: true }); }));

module.exports = router;
