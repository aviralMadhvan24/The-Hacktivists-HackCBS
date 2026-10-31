# LiquidityOS

**Family financial resilience and investment intelligence.** LiquidityOS brings a family's accounts, investments, loans and cash flow together, scores how resilient they are, stress-tests them against market crashes, job loss and medical emergencies, and evaluates proposed investments against the whole family position.

## What it does

- **Family finances**: members with roles, shared and private records, ownership splits (including co-owners outside the family) with no double counting.
- **Five-pillar resilience score**: emergency cash, cash flow, debt burden, diversification, market-shock absorption. Deterministic and explained ([methodology](docs/RESILIENCE_SCORE.md)).
- **Stress tests**: combined shocks, month-by-month projections, scenario comparison, breaking-point search, recovery plans ([engine](docs/STRESS_ENGINE.md)).
- **Shared decisions**: propose, preview impact, discuss, vote.
- **Investment agent**: live prices, history and fundamentals; portfolio impact, crash test, transparent checks and alternatives; AI explanation only with consent.
- **Company research**: concall transcripts from company websites or uploads, with every quote verified against the transcript.
- **Price ranges**: Chronos-Bolt forecasts presented as uncertainty ranges with their own backtest ([verification report](docs/FORECASTING.md)).
- **Family memory (Meko)**: approved, sanitised context with strict per-member isolation ([integration](docs/MEKO.md)).

## Architecture

```
apps/web  (React + TS, Vite)  ──/api──▶  backend/ (Node, Express)
                                           ├─ YugabyteDB (YSQL)     source of truth
                                           ├─ engine/               pure financial maths
                                           ├─ Meko (MCP)            contextual memory, feature-gated
                                           ├─ Yahoo / Zerodha       market + broker data
                                           ├─ Gemini (or OpenAI/Anthropic)  narratives only
                                           └─ apps/forecast-service (Python, Chronos-Bolt)
```

## Quick start

```bash
cd backend && npm install && cp .env.example .env   # set APP_ENCRYPTION_KEY
npm run dev:db        # local PostgreSQL for development; copy the printed DATABASE_URL into .env
npm run dev           # API on :3000
cd ../apps/web && npm install && npm run dev        # web on :5173
```

Full instructions: [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md).

## Documentation

| | |
|---|---|
| [STATUS](docs/STATUS.md) | What's done, partial and blocked; setup you need to do |
| [API](docs/API.md) | Endpoint reference |
| [DEPLOYMENT](docs/DEPLOYMENT.md) | Local dev, tests, YugabyteDB Aeon, Docker, production checklist |
| [SECURITY](docs/SECURITY.md) | Controls, known gaps, Indian regulatory considerations |
| [DATA_SOURCES](docs/DATA_SOURCES.md) | Market data, fundamentals, Zerodha, transcripts — limits and costs |
| [MEKO](docs/MEKO.md) · [FORECASTING](docs/FORECASTING.md) | Integration and verification reports |
| [AUDIT_AND_PLAN](docs/AUDIT_AND_PLAN.md) | Original repository audit and progress log |

## Repository layout

`backend/` API and engine · `apps/web/` web app · `apps/forecast-service/` forecasting · `docs/` documentation · `los2/` original iOS app (not maintained by this work) · `branding/`, pitch deck: original assets.

LiquidityOS provides decision support, not investment advice, and never places trades.
