# API Reference

Base path `/api`. JSON in and out. Errors: `{ success: false, error: CODE, message, details? }` with HTTP 400 (validation), 401 (sign-in), 402 (usage limit), 403 (role/consent/CSRF), 404 (not found or not a member), 409 (conflict), 422 (unprocessable), 429 (rate limit), 502/503 (external service/database).

Auth: httpOnly cookie `los_session` (web; writes need header `X-LOS-CSRF: 1`) or `Authorization: Bearer <token>` (API clients). All routes except `/health`, `/auth/*` and `/zerodha/callback` require a session. `:fid` = family id. Money is INR.

## Auth & account
| Method | Path | Notes |
|---|---|---|
| GET | `/health` | DB, integrations; 503 if DB unreachable |
| POST | `/auth/register` | `{email, password(≥8), name}` → `{user, token, expiresAt}` + cookie |
| POST | `/auth/login` | `{email, password}` |
| GET | `/auth/session` | `{user \| null}` (never 401) |
| GET | `/auth/me` | 401 if not signed in |
| POST | `/auth/logout` | |
| POST | `/auth/password` | `{currentPassword, newPassword}`; signs out everywhere |
| GET / PATCH | `/me` | profile + entitlements / `{name}` |
| GET / POST | `/me/consents` | `{scope: ai_analysis\|meko_context\|broker_sync, granted}` |
| GET | `/me/export` | full JSON export |
| POST | `/me/delete` | `{password, confirm: "DELETE"}` |

## Families & membership
| Method | Path | Role |
|---|---|---|
| GET / POST | `/families` | list / `{name}` → you become owner |
| GET / PATCH / DELETE | `/families/:fid` | viewer / admin `{name, approvalThreshold}` / owner |
| GET / POST | `/families/:fid/invitations` | admin; POST `{email, role}` returns a one-time `token` |
| DELETE | `/families/:fid/invitations/:id` | admin |
| GET | `/families/invitations/mine` | invitations for your email |
| POST | `/families/invitations/accept` | `{token}` or `{invitationId}` (email must match) |
| PATCH / DELETE | `/families/:fid/members/:uid` | admin `{role}` (owner for admin roles) / remove or leave |
| GET | `/families/:fid/audit` | admin; last 200 actions |

## Financial records
`:entity` ∈ `accounts`, `liabilities`, `cashflows`. Each has `owners: [{userId, sharePct}]` (shares ≤ 100% total; remainder = owned outside the family) and `visibility: family|private`.

| Method | Path |
|---|---|
| GET / POST | `/families/:fid/:entity` |
| GET / PATCH / DELETE | `/families/:fid/:entity/:id` |
| GET / POST | `/families/:fid/accounts/:aid/holdings` (`{symbol, exchange, sector, instrument, quantity, avgPrice, lastPrice?}`; upserts by symbol) |
| DELETE | `/families/:fid/accounts/:aid/holdings/:hid` |
| GET / POST / DELETE | `/families/:fid/accounts/:aid/transactions[/:tid]` |

Account fields: `name, kind (bank|cash|savings|fixed_deposit|brokerage|mutual_fund|retirement|gold|real_estate|other), liquidity, value, valueSource (manual|holdings), equityPct, institution, maturityDate, notes`.
Liability: `name, kind, outstanding, emiMonthly, interestRatePct, rateType (fixed|floating), remainingMonths, lender`.
Cash flow: `direction (income|expense), category, name, amount, frequency (monthly|quarterly|half_yearly|yearly), essential, startsOn, endsOn`.

## Analytics & stress testing
| Method | Path | Body / query |
|---|---|---|
| GET | `/families/:fid/dashboard` | `?scope=family\|individual&userId=` → position, score, score change, freshness |
| GET | `/families/:fid/score/history` | same scope params |
| GET | `/families/:fid/stress/presets` | |
| POST | `/families/:fid/stress/run` | `{scope?, userId?, shocks[], assumptions?, saveAs?}` — see `STRESS_ENGINE.md` |
| POST | `/families/:fid/stress/compare` | `{scenarios: [{name, shocks}]}` |
| POST | `/families/:fid/stress/reverse` | `{variable, condition, baseShocks?}` |
| POST | `/families/:fid/whatif` | `{decision: {kind: buy_stock\|sell_stock\|purchase\|loan\|recurring, ...}}` |
| GET / DELETE | `/families/:fid/simulations[/:id]` | saved runs (private to creator) |
| POST | `/recovery/plan` | `{familyId, shocks?, targetMonths?, withNarrative?}` |

## Decisions
| Method | Path |
|---|---|
| GET / POST | `/families/:fid/proposals` (`{kind, title, description?, amount?, decision?}`) |
| GET | `/families/:fid/proposals/:pid` (impact redacted for non-proposers) |
| GET | `/families/:fid/proposals/:pid/impact` (recomputed on your view) |
| POST | `/families/:fid/proposals/:pid/comments` `{body}` · `/vote` `{vote: approve\|reject, note?}` · `/withdraw` |

## Intelligence
| Method | Path | Notes |
|---|---|---|
| POST | `/families/:fid/agent/evaluate` | `{symbol, exchange?, amount, fundFrom?, notes?}`; metered |
| GET | `/families/:fid/agent/evaluations[/:id]` | your evaluations |
| GET / POST | `/families/:fid/context` | list / `{kind, title, body, private?, sources?, related?}` (consent required) |
| GET | `/families/:fid/context/search?q=` | `source: meko\|local_index` |
| PATCH / DELETE | `/families/:fid/context/:id` | correct (supersede) / delete |
| POST | `/families/:fid/context/resync` | retry Meko sync |
| GET | `/market/search?q=` · `/market/quote/:symbol` · `/market/history/:symbol?range=` · `/market/status` | |
| POST | `/market/quotes` `{symbols}` · `/market/refresh-holdings` `{familyId}` | |
| GET | `/market/forecast/:symbol?horizon=1-64` | metered; needs forecast service |
| POST | `/concall/analyze` | multipart `transcriptFile` or `transcriptText` + `companyName, ticker, quarter, fiscalYear`; metered |
| POST | `/concall/discover` `{irUrl}` · `/concall/import` `{pdfUrl, companyName, ticker, quarter, fiscalYear}` | |
| GET / POST / DELETE | `/concall/sources[/:id]` · POST `/concall/sources/:id/check` | saved IR pages |
| GET / DELETE | `/concall/history` · `/concall/:id` | |

## Zerodha
| Method | Path |
|---|---|
| GET | `/zerodha/status` · `/zerodha/login-url` · `/zerodha/portfolio` |
| GET | `/zerodha/callback` (public; Kite redirect) |
| POST | `/zerodha/sync` `{familyId, visibility?}` · `/zerodha/disconnect` |

## Forecast service (internal, Python)
`GET /health` · `POST /forecast {values[], horizon, quantiles?}` · `POST /backtest {values[], horizon, origins}`
