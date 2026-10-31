# Running and Deploying LiquidityOS

## Components

| Component | Path | Runtime |
|---|---|---|
| API + web app | `backend/` serves `apps/web/dist` | Node 20+ (tested on 24) |
| Web app (dev) | `apps/web/` | Vite dev server, proxies `/api` → `:3000` |
| Forecast service (optional) | `apps/forecast-service/` | Python 3.12, CPU torch |
| Database | YugabyteDB (YSQL) | Aeon in production; local Postgres or YugabyteDB for development |

## Local development

```bash
# 1. Backend
cd backend
npm install
cp .env.example .env                 # set APP_ENCRYPTION_KEY (see comment in file)
npm run dev:db                       # starts a local PostgreSQL 15 and prints DATABASE_URL → put it in .env
npm run db:import-legacy             # optional: imports old backend/data/users.json accounts
npm run dev                          # http://localhost:3000 (migrations run on start)

# 2. Web app (second terminal)
cd apps/web
npm install
npm run dev                          # http://localhost:5173

# 3. Forecast service (optional, third terminal) — see docs/FORECASTING.md
cd apps/forecast-service && .venv/Scripts/python main.py
# backend/.env: FORECAST_SERVICE_URL=http://127.0.0.1:8000
```

`npm run dev:db` uses PostgreSQL binaries from a dev dependency, so no Docker is needed. YugabyteDB YSQL is PostgreSQL-compatible and the schema avoids extensions; still run the migrations against YugabyteDB before production (below).

## Tests

```bash
cd backend && npm test               # 77 tests; boots its own temporary PostgreSQL
npm run test:remote   # same tests on a separate liquidityos_test DB in your DATABASE_URL cluster, one file at a time
cd apps/web && npx vite build && npx playwright test      # 11 browser tests; needs `npm run dev:db`
E2E_FORECAST_URL=http://127.0.0.1:8000 npx playwright test # include the forecast test
```

## YugabyteDB Aeon

1. Create a cluster at https://cloud.yugabyte.com (free Sandbox for development; Dedicated for production).
2. Add your server's IP to the cluster's IP allow list.
3. Download the cluster CA certificate (`root.crt`) from the Connect page.
4. `backend/.env`:
   ```env
   DATABASE_URL=postgresql://admin:<password>@<host>:5433/yugabyte
   DB_SSL=verify-full
   DB_SSL_ROOT_CERT=/path/to/root.crt
   ```
5. `npm run db:migrate` (or start the server; it migrates on boot). The migration runner refuses non-UTF8 databases and modified migration files.
6. Verify: `npm test` with `TEST_DATABASE_URL` pointing at a **separate** test database, and `GET /api/health` should report `"engine": "YugabyteDB"`.

Transactions retry automatically on YugabyteDB serialization conflicts (SQLSTATE 40001). Primary keys are random UUIDs, which distribute evenly across tablets.

Networks that rotate their public IP (common on college and office networks) need every outgoing IP in the allow list, or connections will time out intermittently.

Backups: enable scheduled backups and point-in-time recovery in Aeon; test a restore into a new cluster before launch.

## Docker

```bash
docker build -t liquidityos .                                # API + web
docker build -t liquidityos-forecast apps/forecast-service   # bakes in model weights (~190MB)
docker compose up --build                                    # api + forecast, using backend/.env
docker compose --profile localdb up --build                  # also runs single-node YugabyteDB on :5433
```

With the `localdb` profile, set `DATABASE_URL=postgresql://yugabyte@yugabyte:5433/yugabyte` in `backend/.env`.

## Production checklist

- `NODE_ENV=production` (secure cookies, no error details), `TRUST_PROXY=1` behind a load balancer, HTTPS only.
- `WEB_APP_URL` = public URL; `CORS_ORIGINS` empty unless the web app is on another origin.
- Strong `APP_ENCRYPTION_KEY` from a secret manager; never commit `.env`.
- Licensed market-data feed before commercial use (`DATA_SOURCES.md`).
- Shared rate-limit store if you run more than one API instance; error tracking; log retention.
- Legal review: `SECURITY.md` → Indian regulatory considerations.
- Deploy targets that fit: any container host (Render, Railway, Fly.io, AWS ECS/App Runner, GCP Cloud Run) with the forecast service as a second, private service.
