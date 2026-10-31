# FinSight Monorepo Overview

This repository follows a **monorepo** layout to keep the frontend, backend, and AI agent service together while sharing code and configuration.

```
finsight/
├─ apps/
│   ├─ web/            # Next.js (TypeScript) UI
│   ├─ api/            # Node/Express backend (auth, financial routes)
│   └─ agent-service/  # Python FastAPI + LangGraph agents
├─ packages/
│   ├─ shared-types/   # TypeScript types shared across apps
│   └─ validation/     # Zod schemas for request validation
├─ infrastructure/
│   ├─ docker/         # Dockerfiles for each service
│   └─ docker-compose.yml
├─ docs/               # Architecture diagrams, API docs
├─ .gitignore
├─ README.md           # High‑level project description
└─ .env.example        # Sample environment variables
```

The original code from `LiquidityOS-main` (backend API, auth, market routes, etc.) has been moved into `apps/api` and will be gradually migrated to TypeScript.

---
**Next steps** – see `RUNNING.md` for detailed setup and start commands.
