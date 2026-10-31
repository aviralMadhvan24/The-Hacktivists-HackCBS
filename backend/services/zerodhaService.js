// Zerodha Kite Connect v3 integration, per user.
//
// Flow
//  1. GET  /api/zerodha/login-url  → creates a one-time state bound to the user,
//     returns the Kite login URL with redirect_params=state=<state>.
//  2. Kite redirects to ZERODHA_REDIRECT_URL (/api/zerodha/callback) with
//     request_token and our state. The state identifies the user.
//  3. request_token → access_token via POST /session/token with
//     checksum = SHA256(api_key + request_token + api_secret).
//  4. The access token is stored AES-256-GCM encrypted. Kite access tokens are
//     valid until 6:00 AM IST the next day; Kite Connect has no refresh token
//     for retail apps, so the user re-authenticates daily.
//  5. Sync: GET /portfolio/holdings and /user/margins/equity → holdings in a
//     brokerage account the user owns.
//
// Docs: https://kite.trade/docs/connect/v3/
const crypto = require('crypto');
const { randomUUID } = crypto;
const db = require('../db/pool');
const { encrypt, decrypt, randomToken } = require('../lib/security');
const { audit } = require('../lib/audit');
const { HttpError, badRequest, notFound } = require('../lib/http');
const familyService = require('./familyService');
const market = require('./marketData');

// ---- Demo simulation -------------------------------------------------------
// Lets people try the Zerodha flow without Kite Connect credentials. Everything
// it creates is labelled "simulated": the connection, the account name and the
// price source. It never calls Kite. Disable with ZERODHA_SIMULATION=false.
const simulationEnabled = () => process.env.ZERODHA_SIMULATION !== 'false';
const SIM_DAYS = 30; // demo sessions outlast Kite's daily expiry so demos don't break overnight

// A basket of large NSE names; a simulated account gets a deterministic subset.
const SIM_BASKET = [
  { symbol: 'RELIANCE', sector: 'Energy', avgPrice: 1250 },
  { symbol: 'TCS', sector: 'Technology', avgPrice: 3400 },
  { symbol: 'INFY', sector: 'Technology', avgPrice: 1500 },
  { symbol: 'HDFCBANK', sector: 'Financial Services', avgPrice: 820 },
  { symbol: 'ICICIBANK', sector: 'Financial Services', avgPrice: 1200 },
  { symbol: 'ITC', sector: 'Consumer Staples', avgPrice: 420 },
  { symbol: 'LT', sector: 'Industrials', avgPrice: 3400 },
  { symbol: 'BHARTIARTL', sector: 'Telecom', avgPrice: 1600 },
  { symbol: 'HINDUNILVR', sector: 'Consumer Staples', avgPrice: 2400 },
  { symbol: 'SUNPHARMA', sector: 'Healthcare', avgPrice: 1600 },
  { symbol: 'NIFTYBEES', sector: 'Diversified (index ETF)', instrument: 'etf', avgPrice: 260 },
];

function defaultSimPortfolio(userId) {
  const h = crypto.createHash('sha256').update(String(userId)).digest();
  const picks = SIM_BASKET.filter((_, i) => h[i] % 2 === 0).slice(0, 5);
  const list = picks.length >= 3 ? picks : SIM_BASKET.slice(0, 4);
  return {
    holdings: list.map((b, i) => ({ ...b, instrument: b.instrument || 'equity', quantity: Math.max(5, Math.round((80000 + h[i + 12] * 400) / b.avgPrice)) })),
    availableCash: 15000 + h[30] * 100,
  };
}

function cleanSimPortfolio(p) {
  if (!p || !Array.isArray(p.holdings) || !p.holdings.length || p.holdings.length > 50) throw badRequest('Simulated portfolio needs 1-50 holdings.');
  return {
    holdings: p.holdings.map((x) => {
      const symbol = String(x.symbol || '').toUpperCase().trim();
      if (!/^[A-Z0-9&-]{1,20}$/.test(symbol) || !(Number(x.quantity) > 0) || !(Number(x.avgPrice) >= 0)) throw badRequest(`Invalid simulated holding ${symbol}.`);
      return { symbol, sector: x.sector ? String(x.sector).slice(0, 60) : null, instrument: x.instrument === 'etf' ? 'etf' : 'equity', quantity: Number(x.quantity), avgPrice: Number(x.avgPrice) };
    }),
    availableCash: Number(p.availableCash) || 0,
  };
}

/** Creates a simulated Zerodha connection (no Kite involved). */
async function connectSimulated(userId, { portfolio } = {}, ip) {
  if (!simulationEnabled()) throw new HttpError(403, 'ZERODHA_SIMULATION_DISABLED', 'Zerodha demo simulation is disabled on this server.');
  const p = portfolio ? cleanSimPortfolio(portfolio) : defaultSimPortfolio(userId);
  const u = (await db.query('SELECT name FROM users WHERE id = $1', [userId])).rows[0];
  const brokerUserId = `DEMO${crypto.createHash('sha256').update(String(userId)).digest('hex').slice(0, 4).toUpperCase()}`;
  await db.withTransaction(async (c) => {
    await c.query("UPDATE broker_connections SET revoked_at = now() WHERE user_id = $1 AND broker = 'zerodha' AND revoked_at IS NULL", [userId]);
    await c.query(
      `INSERT INTO broker_connections (id, user_id, broker, broker_user_id, broker_user_name, access_token_enc, expires_at, simulated, simulated_portfolio)
       VALUES ($1,$2,'zerodha',$3,$4,$5,$6,true,$7)`,
      [randomUUID(), userId, brokerUserId, u?.name || 'Demo investor', encrypt(`simulated:${randomToken(16)}`), new Date(Date.now() + SIM_DAYS * 86400000), JSON.stringify(p)]);
    await audit({ actorId: userId, action: 'broker.connect', entityType: 'broker', entityId: 'zerodha', details: { brokerUserId, simulated: true }, ip }, c);
  });
  return status(userId);
}

/** Simulated equivalent of Kite's holdings + margins, priced live where possible. */
async function simulatedPortfolio(connection) {
  const p = connection.simulated_portfolio || { holdings: [], availableCash: 0 };
  const holdings = [];
  for (const h of p.holdings) {
    let lastPrice = null; let priceSource = 'simulated';
    try {
      const q = await market.getQuote(h.symbol);
      if (q.currentPrice > 0 && q.freshness !== 'DEMO_DATA') { lastPrice = q.currentPrice; priceSource = 'market'; }
    } catch (_) { /* offline: value at average price */ }
    if (lastPrice == null) lastPrice = h.avgPrice;
    holdings.push({ symbol: h.symbol, exchange: 'NSE', isin: null, sector: h.sector || null, instrument: h.instrument || 'equity',
      quantity: h.quantity, avgPrice: h.avgPrice, lastPrice, priceSource,
      pnl: Math.round((lastPrice - h.avgPrice) * h.quantity * 100) / 100, dayChangePct: null });
  }
  return { holdings, funds: { net: p.availableCash, availableCash: p.availableCash, liveBalance: p.availableCash } };
}

const KITE_API = process.env.ZERODHA_API_BASE || 'https://api.kite.trade';
const KITE_LOGIN = 'https://kite.zerodha.com/connect/login';
const STATE_TTL_MIN = 10;

const apiKey = () => process.env.ZERODHA_API_KEY || '';
const apiSecret = () => process.env.ZERODHA_API_SECRET || '';
const isConfigured = () => Boolean(apiKey() && apiSecret());

function requireConfigured() {
  if (!isConfigured()) {
    throw new HttpError(503, 'ZERODHA_NOT_CONFIGURED',
      'Zerodha is not configured. Create a Kite Connect app at https://developers.kite.trade/ and set ZERODHA_API_KEY, ZERODHA_API_SECRET and ZERODHA_REDIRECT_URL.');
  }
}

/** Next 06:00 IST (00:30 UTC) after `from`. */
function nextKiteExpiry(from = new Date()) {
  const d = new Date(Date.UTC(from.getUTCFullYear(), from.getUTCMonth(), from.getUTCDate(), 0, 30, 0));
  if (d <= from) d.setUTCDate(d.getUTCDate() + 1);
  return d;
}

function checksum(requestToken) {
  return crypto.createHash('sha256').update(`${apiKey()}${requestToken}${apiSecret()}`).digest('hex');
}

async function kiteFetch(path, { accessToken, method = 'GET', body } = {}) {
  const headers = { 'X-Kite-Version': '3' };
  if (accessToken) headers.Authorization = `token ${apiKey()}:${accessToken}`;
  if (body) headers['Content-Type'] = 'application/x-www-form-urlencoded';
  let res;
  try {
    res = await fetch(`${KITE_API}${path}`, { method, headers, body, signal: AbortSignal.timeout(15000) });
  } catch (err) {
    throw new HttpError(502, 'ZERODHA_UNREACHABLE', `Could not reach Zerodha: ${err.message}`);
  }
  let data;
  try { data = await res.json(); } catch (_) { data = {}; }
  if (res.status === 403 || data.error_type === 'TokenException') {
    throw new HttpError(401, 'ZERODHA_SESSION_EXPIRED', 'Your Zerodha session has expired. Please reconnect Zerodha.');
  }
  if (res.status === 429) throw new HttpError(429, 'ZERODHA_RATE_LIMITED', 'Zerodha rate limit reached. Try again in a minute.');
  if (!res.ok || data.status !== 'success') {
    throw new HttpError(502, 'ZERODHA_ERROR', data.message || `Zerodha returned HTTP ${res.status}.`);
  }
  return data.data;
}

async function createLoginUrl(userId) {
  requireConfigured();
  const state = randomToken(24);
  await db.query('DELETE FROM oauth_states WHERE expires_at < now()');
  await db.query('INSERT INTO oauth_states (state, user_id, provider, expires_at) VALUES ($1,$2,$3,$4)',
    [state, userId, 'zerodha', new Date(Date.now() + STATE_TTL_MIN * 60000)]);
  const redirectParams = encodeURIComponent(`state=${state}`);
  return `${KITE_LOGIN}?v=3&api_key=${encodeURIComponent(apiKey())}&redirect_params=${redirectParams}`;
}

/** Handles the OAuth callback. Returns the user id the connection belongs to. */
async function handleCallback({ requestToken, state, status }) {
  requireConfigured();
  if (!state) throw badRequest('Missing state. Start the Zerodha connection from FinSight.');
  const { rows } = await db.query(
    "DELETE FROM oauth_states WHERE state = $1 AND provider = 'zerodha' AND expires_at > now() RETURNING user_id", [String(state)]);
  if (!rows[0]) throw badRequest('This Zerodha login link has expired or was already used. Please try again.');
  const userId = rows[0].user_id;
  if (status !== 'success' || !requestToken) throw badRequest('Zerodha login was cancelled or failed.');

  const params = new URLSearchParams({ api_key: apiKey(), request_token: String(requestToken), checksum: checksum(String(requestToken)) });
  const session = await kiteFetch('/session/token', { method: 'POST', body: params.toString() });
  await db.withTransaction(async (c) => {
    await c.query("UPDATE broker_connections SET revoked_at = now() WHERE user_id = $1 AND broker = 'zerodha' AND revoked_at IS NULL", [userId]);
    await c.query(
      `INSERT INTO broker_connections (id, user_id, broker, broker_user_id, broker_user_name, access_token_enc, expires_at)
       VALUES ($1,$2,'zerodha',$3,$4,$5,$6)`,
      [randomUUID(), userId, session.user_id, session.user_name || session.user_shortname || null, encrypt(session.access_token), nextKiteExpiry()]);
    await audit({ actorId: userId, action: 'broker.connect', entityType: 'broker', entityId: 'zerodha', details: { brokerUserId: session.user_id } }, c);
  });
  return userId;
}

async function activeConnection(userId) {
  const { rows } = await db.query(
    `SELECT * FROM broker_connections WHERE user_id = $1 AND broker = 'zerodha' AND revoked_at IS NULL
     ORDER BY connected_at DESC LIMIT 1`, [userId]);
  return rows[0] || null;
}

async function status(userId) {
  const c = await activeConnection(userId);
  const connected = Boolean(c && new Date(c.expires_at) > new Date());
  return {
    isConfigured: isConfigured(),
    simulationAvailable: simulationEnabled(),
    isConnected: connected,
    simulated: Boolean(c?.simulated),
    connection: c ? {
      simulated: Boolean(c.simulated),
      brokerUserId: c.broker_user_id, brokerUserName: c.broker_user_name, connectedAt: c.connected_at,
      expiresAt: c.expires_at, lastSyncedAt: c.last_synced_at, expired: !connected,
    } : null,
    note: c?.simulated
      ? 'Simulated demo connection: no real Zerodha account is linked and the holdings are sample data, priced at live market prices where available.'
      : 'Zerodha access tokens expire daily at 6:00 AM IST; reconnect to sync again.',
  };
}

async function accessToken(userId) {
  const c = await activeConnection(userId);
  if (!c) throw new HttpError(400, 'ZERODHA_NOT_CONNECTED', 'Zerodha is not connected.');
  if (new Date(c.expires_at) <= new Date()) throw new HttpError(401, 'ZERODHA_SESSION_EXPIRED', 'Your Zerodha session has expired. Please reconnect Zerodha.');
  return { token: decrypt(c.access_token_enc), connection: c };
}

/** Fetches live holdings and equity funds from Kite (no persistence). */
async function fetchPortfolio(userId) {
  const { token, connection } = await accessToken(userId);
  if (connection.simulated) return { ...(await simulatedPortfolio(connection)), simulated: true, fetchedAt: new Date().toISOString() };
  const holdings = await kiteFetch('/portfolio/holdings', { accessToken: token });
  let funds = null;
  try {
    const m = await kiteFetch('/user/margins/equity', { accessToken: token });
    funds = { net: m.net ?? null, availableCash: m.available?.cash ?? null, liveBalance: m.available?.live_balance ?? null };
  } catch (err) {
    if (err.code === 'ZERODHA_SESSION_EXPIRED') throw err;
    funds = { error: err.message };
  }
  return {
    holdings: (holdings || []).map((h) => ({
      symbol: h.tradingsymbol, exchange: h.exchange === 'BSE' ? 'BSE' : 'NSE', isin: h.isin || null,
      quantity: (h.quantity || 0) + (h.t1_quantity || 0), avgPrice: h.average_price || 0, lastPrice: h.last_price || null,
      pnl: h.pnl ?? null, dayChangePct: h.day_change_percentage ?? null,
    })),
    funds,
    fetchedAt: new Date().toISOString(),
  };
}

/**
 * Syncs Zerodha holdings into a brokerage account in a family, owned 100% by the user.
 * Creates the account on first sync. Holdings no longer at Zerodha are removed from it.
 */
async function syncToFamily(userId, { familyId, visibility = 'private' }, ip) {
  await familyService.requireRole(familyId, userId, 'member');
  if (!['private', 'family'].includes(visibility)) throw badRequest('visibility must be private or family.');
  const portfolio = await fetchPortfolio(userId);
  const { connection } = await accessToken(userId);
  const accountName = connection.simulated ? `Zerodha demat (${connection.broker_user_id}, simulated)` : `Zerodha demat (${connection.broker_user_id})`;

  const result = await db.withTransaction(async (c) => {
    const existing = await c.query(
      `SELECT a.id FROM accounts a JOIN account_owners o ON o.account_id = a.id
       WHERE a.family_id = $1 AND a.kind = 'brokerage' AND a.value_source = 'broker' AND a.institution = 'Zerodha'
         AND a.name = $2 AND o.user_id = $3 AND a.deleted_at IS NULL LIMIT 1`, [familyId, accountName, userId]);
    let accountId = existing.rows[0]?.id;
    if (!accountId) {
      accountId = randomUUID();
      await c.query(
        `INSERT INTO accounts (id, family_id, created_by, name, kind, liquidity, value_source, equity_pct, visibility, institution)
         VALUES ($1,$2,$3,$4,'brokerage','semi_liquid','broker',100,$5,'Zerodha')`,
        [accountId, familyId, userId, accountName, visibility]);
      await c.query('INSERT INTO account_owners (account_id, user_id, share_pct) VALUES ($1,$2,100)', [accountId, userId]);
    }
    const symbols = [];
    for (const h of portfolio.holdings) {
      if (h.quantity <= 0) continue;
      symbols.push(`${h.exchange}:${h.symbol}`);
      await c.query(
        `INSERT INTO holdings (id, account_id, symbol, exchange, isin, quantity, avg_price, last_price, price_as_of, price_source, source, sector, instrument)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,now(),$9,'zerodha',$10,$11)
         ON CONFLICT (account_id, exchange, symbol) DO UPDATE SET quantity = EXCLUDED.quantity, avg_price = EXCLUDED.avg_price,
           isin = COALESCE(EXCLUDED.isin, holdings.isin), last_price = EXCLUDED.last_price, price_as_of = now(),
           price_source = EXCLUDED.price_source, source = 'zerodha', sector = COALESCE(holdings.sector, EXCLUDED.sector),
           instrument = EXCLUDED.instrument, updated_at = now()`,
        [randomUUID(), accountId, h.symbol, h.exchange, h.isin, h.quantity, h.avgPrice, h.lastPrice,
          connection.simulated ? (h.priceSource === 'market' ? 'simulated-holding/market-price' : 'simulated') : 'zerodha',
          h.sector || null, h.instrument || 'equity']);
    }
    const removed = await c.query(
      `DELETE FROM holdings WHERE account_id = $1 AND source = 'zerodha' AND NOT ((exchange || ':' || symbol) = ANY($2::text[]))`,
      [accountId, symbols]);
    await c.query('UPDATE broker_connections SET last_synced_at = now() WHERE id = $1', [connection.id]);
    await audit({ familyId, actorId: userId, action: 'broker.sync', entityType: 'account', entityId: accountId, details: { holdings: symbols.length, removed: removed.rowCount, simulated: Boolean(connection.simulated) }, ip }, c);
    return { accountId, holdingsSynced: symbols.length, holdingsRemoved: removed.rowCount };
  });
  return { ...result, funds: portfolio.funds, fetchedAt: portfolio.fetchedAt, simulated: Boolean(connection.simulated),
    note: connection.simulated
      ? 'Simulated demo data: sample holdings, priced at live market prices where available. Disconnecting removes this simulated account.'
      : 'Sectors are not provided by Zerodha. Set them on each holding for accurate diversification analysis.' };
}

async function disconnect(userId, ip) {
  const c = await activeConnection(userId);
  if (!c) throw notFound('No Zerodha connection.');
  if (c.simulated) {
    // Simulated data must not linger in a real family: remove the simulated accounts too.
    await db.withTransaction(async (t) => {
      await t.query(
        `UPDATE accounts SET deleted_at = now() WHERE deleted_at IS NULL AND id IN (
           SELECT a.id FROM accounts a JOIN account_owners o ON o.account_id = a.id
           WHERE o.user_id = $1 AND a.institution = 'Zerodha' AND a.value_source = 'broker' AND a.name LIKE '%, simulated)')`, [userId]);
      await t.query('UPDATE broker_connections SET revoked_at = now(), access_token_enc = $2 WHERE id = $1', [c.id, 'revoked']);
      await audit({ actorId: userId, action: 'broker.disconnect', entityType: 'broker', entityId: 'zerodha', details: { simulated: true }, ip }, t);
    });
    return;
  }
  // Best-effort server-side logout; the token is revoked locally regardless.
  try {
    if (new Date(c.expires_at) > new Date()) {
      await fetch(`${KITE_API}/session/token?api_key=${encodeURIComponent(apiKey())}&access_token=${encodeURIComponent(decrypt(c.access_token_enc))}`,
        { method: 'DELETE', headers: { 'X-Kite-Version': '3' }, signal: AbortSignal.timeout(10000) });
    }
  } catch (_) { /* ignore network errors on logout */ }
  await db.query('UPDATE broker_connections SET revoked_at = now(), access_token_enc = $2 WHERE id = $1', [c.id, 'revoked']);
  await audit({ actorId: userId, action: 'broker.disconnect', entityType: 'broker', entityId: 'zerodha', ip });
}

module.exports = { isConfigured, simulationEnabled, connectSimulated, defaultSimPortfolio, createLoginUrl, handleCallback, status, fetchPortfolio, syncToFamily, disconnect, nextKiteExpiry, checksum };
