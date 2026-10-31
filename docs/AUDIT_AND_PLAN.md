# FinSight — Phase A Audit & Implementation Plan

_Audit date: 2026-10-31_

## 1. What exists

| Area | Location | State |
|---|---|---|
| iOS app (SwiftUI, ~12k lines) | `los2/` | Working iOS client. Holds most financial logic: 5-pillar score, runway, emergency sim, reverse stress (bisection), what-if stock sim, scenario compare. **Not reusable directly on web** — logic must be ported to TypeScript. |
| Node/Express backend (JS) | `backend/` | **The real backend.** 24/24 tests pass (`node --test`). Routes: auth, concall, market, recovery, zerodha. |
| TS API scaffold | `apps/api/` | Broken: `server.ts` imports `./routes/*` that do not exist. Prisma listed but no schema. |
| Next.js scaffold | `apps/web/` | Empty: config only, no pages/components. Next 13.5 (old). |
| Docs | `README.md`, `RUNNING.md`, `MONOREPO_OVERVIEW.md` | `RUNNING.md`/`MONOREPO_OVERVIEW.md` describe services (agent-service, infrastructure/, Prisma, Redis) that **do not exist**. |
| Pitch/branding | `FinSight_Pitch_Deck.*`, `branding/` | Static assets; brand name "FinSight" vs product "FinSight". |

Not a git repository.

## 2. Backend findings

**Working and worth keeping**
- `authService` PBKDF2-SHA512 password hashing with salt + timing-safe compare.
- Concall analyzer: strict anti-hallucination prompt, JSON schema validation, Gemini/OpenAI/Anthropic adapters, PDF extraction with magic-byte check.
- Market data adapter pattern (`MarketDataAdapter` → Yahoo / Mock) with cache, stale flag and `DEMO_DATA` labelling.
- Zerodha Kite Connect: correct OAuth checksum (`SHA256(api_key+request_token+api_secret)`), holdings + margins fetch.
- Recovery planner: deterministic plans + optional LLM narrative.

**Defects / technical debt (must fix)**
| # | Issue | Severity |
|---|---|---|
| 1 | Persistence is JSON files (`data/users.json`, `saved_analyses.json`); no DB. | High |
| 2 | Sessions in an in-memory `Map` — every restart logs everyone out; no expiry. | High |
| 3 | `GET /api/auth/users` is **unauthenticated** and lists every user's email. | High (privacy) |
| 4 | Zerodha session is a **process-wide singleton** — one user's broker session is served to all users. Tokens held in memory only. | Critical |
| 5 | Concall history is global, not scoped per user. | High |
| 6 | No auth middleware on concall/market/recovery/zerodha routes. | High |
| 7 | `zerodha/callback` interpolates `err.message` into HTML (reflected XSS). | Medium |
| 8 | Market quotes silently fall back to mock prices on provider failure (labelled `DEMO_DATA`, but still risky in a finance UI). | Medium |
| 9 | No rate limiting, open CORS, no input schema validation, `multer` 1.x has known CVEs. | Medium |
| 10 | Recovery plans assume discretionary spend = 40% of expenses (hard-coded). | Medium (must be explicit/user-set) |
| 11 | Demo Zerodha portfolio hard-codes a real person's name. | Low (remove) |

**Swift scoring engine issues (to fix while porting)**
- Pillar 5 max is 14, not 15, and depends only on the shock size — not on the family's liquidity.
- Pillar 4 silently assumes a 35% top holding when there are no holdings.
- `activeHoldings` falls back to pitch-deck sample holdings when user has none (fake data in real calculations).
- Reverse stress breach rule adds an unexplained `portfolioValue × 0.25` buffer.

## 3. Environment
- Node 24, npm 11, Python 3.12/3.13, git 2.47 available.
- Docker CLI installed, **daemon not running**. No YugabyteDB/Postgres locally.
- Network: Yahoo Finance chart API reachable (200). **NSE and BSE websites return 403** to automated requests.
- No `backend/.env` → no LLM, Zerodha, or Meko credentials configured.

## 4. Target architecture

```
apps/web  (React + TypeScript SPA)  ──HTTP──▶  backend/ (Express, extended)
                                                 ├─ YugabyteDB (YSQL)  ← source of truth
                                                 ├─ Meko (backend-only creds, feature-gated)
                                                 ├─ Market data adapters (Yahoo, Kite)
                                                 ├─ LLM adapters (existing)
                                                 └─ forecast-service (Python, only if model needs it)
```
- Financial engine: pure TypeScript/JS module (`backend/src/engine/`), deterministic, unit-tested against hand-computed cases. Shared by API; web calls API.
- Migrations: plain SQL files run by a small migration runner (YSQL is Postgres-compatible); existing `users.json` users migrated with their PBKDF2 hashes intact.

## 5. Phase plan
- **B — Core:** DB + migrations, auth (DB sessions, expiry), families/members/roles/consent, accounts/assets/liabilities with ownership %, audit log, per-user Zerodha tokens (encrypted).
- **C — Financial platform:** consolidation engine (ownership-weighted, no double count), 5-pillar score, stress engine (market, emergency, combined, reverse, recovery, projections), web dashboards.
- **D — Context:** Meko backend integration (verify supported method first), decision proposals/comments/approvals, investment agent.
- **E — Advanced:** forecasting model verification + integration, concall discovery pipeline, entitlements.
- **F — Validation:** security/privacy review, E2E tests, deployment docs.

## 6. Progress log
- 2026-10-31 — Phase A complete. Existing tests 24/24 pass.
- 2026-10-31 — Phase B: schema + migrations, DB auth, families/roles/invites, records with ownership and visibility, audit log, per-user Zerodha. Removed RUNNING.md and MONOREPO_OVERVIEW.md (described services that never existed) and the broken apps/api + empty Next.js scaffolds.
- 2026-10-31 — Phase C: consolidation, five-pillar score, stress/reverse/what-if/recovery engines, dashboards and web app.
- 2026-10-31 — Phase D: Meko context layer (MCP), investment agent.
- 2026-10-31 — Phase E: Chronos-Bolt forecasting (verified + backtested), concall discovery, entitlements.
- 2026-10-31 — Phase F: security review fixes (XSS link schemes, SSRF), docs. 76 backend + 11 browser tests passing. See docs/STATUS.md.
