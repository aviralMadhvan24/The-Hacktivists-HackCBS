# Feature Status

_2026-10-31. "Done" = implemented and exercised by automated tests and/or a live run. Evidence in brackets._

## Done

| Feature | Evidence |
|---|---|
| Accounts, sessions, password upgrade, legacy user import | backend `auth.test.js`; live import of `users.json` |
| Families, roles, invitations (link + in-app), role changes, leave/remove, audit log | `family.test.js`; browser `family-flow.spec.ts` |
| Accounts, holdings, loans, income/expenses, transactions; ownership shares; private/shared visibility | `family.test.js`; browser |
| Consolidated and individual net worth, liquidity split, cash flow, savings rate, four runway measures — no double counting | `engine.test.js` (hand-computed); `family.test.js` |
| Five-pillar resilience score with formulas, metrics, actions, history and change explanations | `engine.test.js`; `docs/RESILIENCE_SCORE.md` |
| Stress tests: market/stock/sector, one-time and recurring medical, job loss (household or one member), expense rise, inflation, EMI rise, combined; projections; recovery timeline | `engine.test.js`; browser |
| Scenario comparison, reverse stress testing, saved scenarios, recovery plans | `engine.test.js`, `family.test.js`; browser |
| Shared decisions: proposals, what-if impact, comments, votes, approval rule, privacy-aware impact | `family.test.js`; browser |
| Investment agent: live price/history/fundamentals, risk stats, portfolio impact, crash test, fit checks, alternatives, scenarios, sources; AI narrative behind consent | `agent.test.js`; live run on HDFCBANK; browser |
| Meko context layer with isolation, sanitisation, correction, deletion, outage fallback | `meko.test.js` (MCP test double); browser (local mode) |
| Concall analysis (upload/paste) with verbatim quote verification; per-user history | `concall.test.js` |
| Concall discovery from company IR pages, SSRF-safe; import with prior-quarter comparison | `concall.test.js`; live discovery on HDFC Bank (6 transcripts) |
| Stock forecasting with a verified pretrained model + per-stock backtest | live inference; 72 backtests (`docs/FORECASTING.md`); browser |
| Market data with honest freshness labels; holding price refresh | live quotes; browser |
| Entitlements and usage limits (backend-enforced, refunded on failure) | `agent.test.js` |
| Consent, data export, account deletion | `family.test.js`, `meko.test.js` |
| Responsive web app (desktop + phone width), loading/empty/error states | 11 Playwright tests incl. mobile overflow |
| Persistence across restarts | Manual restart check (session and family survived) |
| **YugabyteDB Aeon** | Migrations 001–005 applied on YugabyteDB 2026.1.2 (Aeon, ap-south-1); all 77 backend tests pass against a separate `liquidityos_test` database on the cluster via `npm run test:remote` (2026-10-31) |
| **Meko (live)** | Datapack creation, memory_add (ids returned), memory_search and per-member isolation verified against live Meko from the backend with the demo family (2026-10-31). Found and fixed: live Meko requires conversation_id for datapack_create/delete. |
| Ask FinSight (chat agent) | Tool-using agent over the engines and Meko; tests with a stubbed LLM (tool loop, grounding, consent, prompt-injection handling); live answer verified with Gemini on the demo family |
| Gemini model fallback | Primary `gemini-flash-latest`, then `gemini-3.6-flash`, `gemini-3.5-flash` on 404/429/503 (Google retired gemini-2.5-flash for new keys) |
| Demo data | `npm run seed:demo` creates two labelled demo families (6 users) with live-priced holdings, proposals and Meko memories |

## Partially done

| Feature | What's missing |
|---|---|
| **Zerodha** | OAuth, encrypted tokens, holdings/funds sync and expiry handling implemented. **Not live-tested** — needs a paid Kite Connect app. |
| **AI narratives** (agent, concall analysis, recovery) | Implemented for Gemini/OpenAI/Anthropic with JSON validation and quote checks. **Not run live** — no `GEMINI_API_KEY` configured. |
| Docker | Dockerfiles and compose written; **images not built** — Docker Desktop's engine isn't running on this machine. |
| Corporate actions | Used for adjusted prices; not applied to manually entered holding quantities. |
| Trading calendar | Forecast dates skip weekends but not NSE holidays. |

## Not done / blocked

| Item | Reason |
|---|---|
| NSE/BSE announcement scraping | Both block automated access; bypassing it isn't legitimate. Company IR pages + upload are used instead. |
| Payment gateway and pricing | Needs your decision (you asked not to invent pricing). Entitlement plumbing is ready (`free` / `premium`). |
| Password reset, email verification, MFA | No email/SMS provider chosen. |
| Bank account aggregation | Needs an RBI Account Aggregator partner and consent flow. |
| Licensed market data | Commercial decision; Yahoo is fine for development only. |
| iOS app updates | Out of scope (web app requested). The iOS app's old endpoints for demo accounts and demo Zerodha were removed. |

## Manual setup you need to do

1. **YugabyteDB Aeon**: create a cluster and send the YSQL connection string and `root.crt` (see `DEPLOYMENT.md`).
2. **Gemini**: create an API key and set `GEMINI_API_KEY` in `backend/.env`. Note: your Windows environment already has an `OPENAI_API_KEY`, which the backend will use if no Gemini key is set.
3. **Meko**: create a dedicated API key for the backend; set `MEKO_ENABLED=true`, `MEKO_MCP_URL`, `MEKO_API_KEY`.
4. **Zerodha** (optional): Kite Connect app + redirect URL.
5. **Legal**: review SEBI investment-adviser/research-analyst rules and DPDP obligations before a paid launch.
