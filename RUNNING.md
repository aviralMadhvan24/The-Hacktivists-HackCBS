# Running FinSight (Monorepo)

## Prerequisites
- **Node.js** (v20 or later) and **npm**
- **Python 3.11+** (for the agent service)
- **Docker** (optional, for containerised development)
- **PostgreSQL** database (local or via Docker)
- **Redis** (for background jobs / caching)

## 1. Clone the repository
```bash
git clone <repo‑url>
cd LiquidityOS-main/LiquidityOS-main   # the root of the project
```

## 2. Set up environment variables
Copy the example file and fill in the required values:
```bash
cp .env.example .env
# Edit .env – at minimum set:
#   DATABASE_URL=postgresql://user:password@localhost:5432/finsight
#   JWT_SECRET=your‑strong‑secret
#   REDIS_URL=redis://localhost:6379
#   (Optional) OPENAI_API_KEY, GEMINI_API_KEY, ANTHROPIC_API_KEY
```

## 3. Install backend dependencies
```bash
cd apps/api
npm install
# Run database migrations (Prisma)
npx prisma migrate dev --name init   # creates tables in the DB
```

## 4. Start the backend API
```bash
npm run dev   # starts the Express server on PORT (default 3000)
# Or, for production build:
npm run build && npm start
```
The health endpoint is available at `http://localhost:3000/api/health`.

## 5. Front‑end (Next.js) – once the `apps/web` folder exists
```bash
cd ../../apps/web
npm install
npm run dev   # runs on http://localhost:3001 by default
```
The UI will proxy API calls to the backend (configured in `next.config.js`).

## 6. Agent Service (Python FastAPI + LangGraph)
```bash
cd ../../apps/agent-service
python -m venv .venv
source .venv/bin/activate   # on Windows: .venv\Scripts\activate
pip install -r requirements.txt
uvicorn main:app --reload   # runs on http://localhost:8000
```
The agent service expects the same `.env` file for LLM keys and DB connection.

## 7. Docker Compose (all services together)
If you prefer containerised development, Dockerfiles are provided under `infrastructure/docker`.
```bash
cd ../../infrastructure
docker-compose up --build
```
Docker Compose will spin up:
- `api` (Node/Express)
- `web` (Next.js)
- `agent` (Python FastAPI)
- `db` (PostgreSQL)
- `redis`

The services will be reachable at:
- API: `http://localhost:3000`
- Web UI: `http://localhost:3001`
- Agent: `http://localhost:8000`

## 8. Running Tests
```bash
# Backend tests (Jest + Supertest)
cd apps/api && npm test
# Front‑end tests (Playwright)
cd ../../apps/web && npm test
# Agent service tests (pytest)
cd ../../apps/agent-service && pytest
```

---
**Tip:** After the first run, visit the `/api/auth/register` endpoint to create a user, then log in via the UI to explore the financial dashboards.
