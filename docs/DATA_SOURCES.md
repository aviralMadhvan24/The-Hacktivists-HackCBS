# Market Data, Broker and Research Sources

| Need | Source | Status | Limits / cost |
|---|---|---|---|
| Quotes (NSE/BSE) | Yahoo Finance chart API (`query1.finance.yahoo.com/v8/finance/chart`, `.NS`/`.BO`) | Working, verified live | Unofficial, no SLA, ~15-min delayed, may rate-limit (429 handled; last value served as STALE). Free. |
| Daily history (5y, adjusted) + splits/dividends | Same endpoint with `events=div,splits` | Working | Bar dates shifted to IST. `adjClose` adjusts for splits/bonuses/dividends. |
| Index (NIFTY 50) | Yahoo `^NSEI` | Working | Same as above |
| Fundamentals (sector, P/E, ROE, margins, D/E, income history) | Yahoo `quoteSummary` (needs session cookie + crumb) | Working | Unofficial; 12h cache. Missing fields stay missing. |
| Holdings, funds | Zerodha Kite Connect v3 | Implemented, **not live-tested** (no credentials) | Kite Connect is a paid subscription (check current pricing on developers.kite.trade). Access tokens expire daily at 06:00 IST; no refresh tokens for retail apps. |
| Concall transcripts | Company investor-relations pages (SEBI LODR Reg. 46 requires publication) | Working where sites allow it (verified: HDFC Bank, 6 transcripts found) | robots.txt honoured, 2s per-host delay, 15MB limit. Some sites block bots (Infosys and TCS returned 403) → user downloads and uploads. |
| NSE / BSE announcement APIs | — | **Not used** | Both return 403 to automated clients (Akamai). Bypassing that would violate their access controls. |
| Trading calendar | — | **Not implemented** | NSE holiday list isn't reachable programmatically here; forecast dates are approximate weekdays (stated in the UI). |
| Corporate actions | Yahoo split/dividend events | Partial | Used for adjusted prices; not yet applied to stored holding quantities (Zerodha already reports post-action quantities). |

## Market data provider modes

- `MARKET_DATA_PROVIDER=YAHOO` (default): real delayed data. If a refresh fails, the last fetched value is returned marked `STALE`; if there is none, an error.
- `MARKET_DATA_PROVIDER=MOCK`: demo prices for development only, always labelled `DEMO_DATA`. The previous silent fallback from Yahoo to demo prices has been removed.

Holding price refresh ignores `DEMO_DATA` and `UNAVAILABLE` quotes, so demo prices never reach financial records.

## For production

Yahoo's endpoints are unofficial and their terms restrict commercial redistribution. Before launch, choose a licensed feed. Options to evaluate (pricing and terms need confirming with each vendor; nothing here has been purchased):

- Zerodha Kite Connect market quotes/historical data (historical is an add-on; personal-use terms)
- NSE data products via authorised vendors (e.g. TrueData, Global Datafeeds)
- For fundamentals and transcripts: licensed providers (e.g. CMOTS, Trendlyne/Tijori APIs, Refinitiv/LSEG)

The adapter interface (`backend/services/marketData/MarketDataAdapter.js`) lets a licensed provider replace Yahoo without touching the engine.

## Zerodha setup

1. Create an app at https://developers.kite.trade/ (paid).
2. Redirect URL: `https://<your-api-host>/api/zerodha/callback`.
3. `backend/.env`: `ZERODHA_API_KEY`, `ZERODHA_API_SECRET`, `WEB_APP_URL`, and a 64-hex-char `APP_ENCRYPTION_KEY` (encrypts access tokens at rest, AES-256-GCM).
4. In the app: Settings → Connect Zerodha → Sync holdings (choose family and visibility, private by default).

Flow details: one-time `state` bound to the user via Kite's `redirect_params`; checksum `SHA256(api_key + request_token + api_secret)`; holdings (+T1 quantity) and equity margins; holdings no longer at Zerodha are removed from the synced account. FinSight never places orders.

## Simulated Zerodha (demo)

Without Kite Connect credentials, users can choose **Try demo connection (simulated)** in Settings. It creates a connection marked `simulated` (migration 006) with sample holdings; nothing is fetched from Zerodha. Holdings are priced at live market prices where available, otherwise at their average price. The account is named `Zerodha demat (DEMOxxxx, simulated)`, holdings carry a *Simulated* badge and a `simulated…` price source, and disconnecting removes the account. The demo seed connects Rajesh Sharma and Rohan Mehta this way. Simulated sessions last 30 days (real Kite sessions expire daily at 6:00 AM IST).
