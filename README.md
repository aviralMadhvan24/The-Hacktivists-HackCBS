# FinSight

**Family financial resilience and investment intelligence, with a voice AI guide that remembers.**
FinSight brings a person's (and, if they choose, their family's) accounts, investments, loans and cash flow together, scores how resilient they are, stress-tests them against market crashes, job loss and medical emergencies, and evaluates decisions against the whole picture. The home page is a conversation: ask in English, Hinglish or Hindi, by text or voice.

## What it does

### Talk to FinSight (home page)
- **Chat-first home**: the chatbot is the first page, with a live **3D orb** (three.js) that listens, thinks and speaks, plus side cards for resilience score, net worth, runway and alerts, and shortcuts to every tool.
- **Voice chat**: browser speech recognition (English/Hinglish or Hindi), spoken replies in a **natural AI voice** (Gemini TTS, falls back to the browser voice), hands-free mode, stop/cancel.
- **Grounded answers**: the chatbot runs real tools (financial summary, stress test, breaking point, decision check, holdings, live quotes, memory search, document search) and every number comes from those results.
- **Just me / Family planning**: personal mode uses your own share of the money and your own memory; family mode uses the family's numbers and the memory of members who choose to share.

### Memory built by Meko, not by us
- FinSight **never writes memories**. Meko builds each person's memory from their **conversations** with the chatbot and their **activity** in the app: stress tests, what-if decision checks, breaking-point tests, investment evaluations, proposals and votes, Zerodha syncs, concall searches and analyses, and document uploads.
- **One Meko datapack per person** (falls back to a personal conversation in a shared datapack when the Meko plan caps datapacks).
- Users can **see and forget** their memories on the Memory page, but nobody can type or edit them. Family sharing is opt-in per member.

### Documents into the knowledge base
- Upload **ITR, CAS / broker statements, salary slips, bank and loan statements, insurance, PAN** (text PDFs up to 5 MB). The original file goes to the person's Meko **knowledge base** after explicit consent, so the chatbot can answer from it.
- AI reads the figures and **suggests records** (income, accounts, holdings, loans); they are added only when the user approves them.

### Money, risk and decisions
- **Finances**: members with roles, shared and private records, ownership splits (including co-owners outside the family) with no double counting.
- **Five-pillar resilience score**: emergency cash, cash flow, debt burden, diversification, market-shock absorption. Deterministic and explained ([methodology](docs/RESILIENCE_SCORE.md)).
- **Stress tests**: combined shocks, month-by-month projections, scenario comparison, breaking-point search, recovery plans ([engine](docs/STRESS_ENGINE.md)).
- **Shared decisions**: propose, preview impact, discuss, vote.
- **Zerodha**: read-only Kite Connect sync, plus a clearly labelled **simulated demo connection** for trying the flow without broker credentials.

### Research
- **Investment agent**: live prices, history and fundamentals; portfolio impact, crash test, transparent checks and alternatives.
- **Concalls**: type a ticker and FinSight looks for the newest earnings-call transcript on the company's own website; or add an investor-relations page, or upload the PDF. Every quote in the AI analysis is verified against the transcript. (Many company sites block automated access; FinSight says so and guides the upload.)
- **Price ranges**: Chronos-Bolt forecasts shown as uncertainty ranges with their own backtest ([verification report](docs/FORECASTING.md)).

## Architecture

```
apps/web  (React + TS, Vite, three.js orb, Web Speech)  ──/api──▶  backend/ (Node, Express)
   ├─ YugabyteDB (YSQL)      source of truth for all records and numbers
   ├─ engine/                pure financial maths (score, stress, what-if)
   ├─ Meko (MCP)             per-person memory + knowledge base (documents)
   ├─ Gemini                 chat agent, narratives, document figures, natural voice (TTS)
   ├─ Yahoo / Zerodha        market + broker data (simulated broker for demos)
   └─ apps/forecast-service  Python, Chronos-Bolt
```

**Key rule:** the AI never invents numbers. Figures come from the database and the deterministic engines; the AI explains them.

## Quick start

```bash
cd backend && npm install && cp .env.example .env   # set APP_ENCRYPTION_KEY; add GEMINI_API_KEY and Meko settings to enable AI and memory
npm run dev:db        # local PostgreSQL for development; copy the printed DATABASE_URL into .env
npm run dev           # API on :3000
cd ../apps/web && npm install && npm run dev        # web on :5173
```

Demo data (one family, clearly labelled demo users, password `demo-pass-123`):

```bash
cd backend && npm run seed:demo -- --reset          # add --with-mehta for a second family
```

Sign in as `rajesh@demo.finsight.test`. Voice input works in Chrome or Edge. Full instructions: [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md).

## Tests

- Backend: `cd backend && npm test` (84 tests; embedded PostgreSQL and an in-process Meko test double), `npm run test:remote` against YugabyteDB Aeon.
- Browser: `cd apps/web && npx playwright test` (desktop and mobile).

## Documentation

| | |
|---|---|
| [STATUS](docs/STATUS.md) | What's done, partial and blocked; setup you need to do |
| [API](docs/API.md) | Endpoint reference |
| [DEPLOYMENT](docs/DEPLOYMENT.md) | Local dev, tests, YugabyteDB Aeon, Docker, production checklist |
| [SECURITY](docs/SECURITY.md) | Controls, known gaps, Indian regulatory considerations |
| [DATA_SOURCES](docs/DATA_SOURCES.md) | Market data, fundamentals, Zerodha (real and simulated), transcripts — limits and costs |
| [MEKO](docs/MEKO.md) | Person memory, family sharing, documents, what is sent to Meko |
| [FORECASTING](docs/FORECASTING.md) | Forecast model and backtest |
| [AUDIT_AND_PLAN](docs/AUDIT_AND_PLAN.md) | Original repository audit and progress log |

## Repository layout

`backend/` API and engine · `apps/web/` web app · `apps/forecast-service/` forecasting · `docs/` documentation · `los2/` original iOS app (not maintained by this work) · `branding/`, pitch deck: original assets.

FinSight provides decision support, not investment advice, and never places trades or moves money.
