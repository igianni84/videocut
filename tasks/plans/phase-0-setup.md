# Phase 0 — Project Setup & Infrastructure

## Context
VideoCut è un monorepo con zero codice applicativo. Git repo inizializzato, docs completi, docker-compose.yml e .env configurati. Serve scaffoldare entrambe le app (Next.js + Python), configurare tooling, creare lo schema DB, e verificare che tutto funzioni.

## Stato attuale
- **Esiste:** git repo (1 commit), docker-compose.yml, .env/.env.example, .gitignore, docs/*, tasks/*
- **Non esiste:** `apps/` dir, package.json, Dockerfile, Supabase migrations, linter/test config
- **Ambiente:** Node.js 25.2.1, npm 11.6.2, Python 3.13.3, Docker 29.2.1, Supabase CLI 2.79.0, `uv` disponibile
- **Supabase Cloud:** configurato (project ref: `agamdakjptqwcjebeuye`)

---

## Piano di esecuzione

### 1. Root monorepo + directory structure
- Creare `package.json` root con npm workspaces (`"workspaces": ["apps/*"]`)
- Creare struttura dir: `apps/web/`, `apps/processor/src/{api,workers,services,models,config}`, `apps/processor/tests/`

### 2. Scaffold Next.js 16 frontend
- `npx create-next-app@latest apps/web --typescript --tailwind --eslint --app --src-dir --import-alias "@/*" --turbopack --yes`
- Creare skeleton directories: `src/components/{ui,auth,upload,editor,billing}`, `src/lib/{supabase,stripe}`, `src/types`, `src/app/api`, `src/app/(auth)`, `src/app/(dashboard)`
- Installare `clsx` + `tailwind-merge`, creare `src/lib/utils.ts` (per shadcn)

### 3. Inizializzare shadcn/ui
- `npx shadcn@latest init --defaults` (NON `--yes`, che si blocca su prompt)
- Aggiungere componenti base: `button`, `card`

### 4. Scaffold Python processor
- Creare `apps/processor/pyproject.toml` con: fastapi, uvicorn, arq, redis, pydantic-settings, supabase, httpx
- Creare `apps/processor/requirements.txt` (per Docker)
- Creare moduli: `src/main.py` (FastAPI app con lifespan), `src/config/settings.py` (pydantic-settings), `src/api/routes.py` (health + process stub), `src/api/dependencies.py` (API key verify)
- Tutti `__init__.py` nei package

### 5. Dockerfile processor
- `apps/processor/Dockerfile`: python:3.13-slim, apt install ffmpeg, pip install requirements.txt, uvicorn
- `apps/processor/.dockerignore` e `.gitignore`

### 6. Environment files
- `apps/web/.env.local` — vars frontend da root .env
- `apps/processor/.env` — vars processor (SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, REDIS_URL, API_KEY)

### 7. Supabase SDK nel frontend
- Installare `@supabase/supabase-js` + `@supabase/ssr`
- Creare `src/lib/supabase/client.ts` (browser client)
- Creare `src/lib/supabase/server.ts` (server client con cookies)
- Creare `src/lib/supabase/middleware.ts` (session refresh)
- Creare `src/middleware.ts` (Next.js middleware)

### 8. Linting & formatting
- Frontend: Prettier + eslint-config-prettier (`apps/web/.prettierrc`)
- Python: Ruff già configurato in pyproject.toml
- Script format in package.json

### 9. Testing
- Frontend: vitest + @vitejs/plugin-react + @testing-library/react + jsdom → `vitest.config.ts`, `src/test/setup.ts`, smoke test
- Python: pytest + pytest-asyncio + httpx → `tests/test_health.py`

### 10. Supabase DB migration
- `npx supabase init` → crea `supabase/` dir
- `npx supabase link --project-ref agamdakjptqwcjebeuye` (richiede TTY)
- Creare migration con schema completo da `docs/database-schema.md`:
  - `update_updated_at()` trigger function
  - Tabelle: profiles, videos, jobs, subscription_events
  - RLS policies su tutte le tabelle
  - Trigger `handle_new_user()` per auto-creazione profile
  - Trigger `updated_at` su tutte le tabelle
  - Realtime su jobs
  - Storage policies (buckets creati da Dashboard)
- `npx supabase db push`
- `npx supabase gen types typescript --linked > apps/web/src/types/database.types.ts`
- **Nota:** Storage buckets (`originals`, `processed`) vanno creati manualmente dalla Dashboard

### 11. npm install + verifiche
- `npm install` dalla root (installa tutte le workspace dependencies)
- Aggiornare `docker-compose.yml` (rimuovere `version` deprecato)

### 12. Verifiche end-to-end
- `npm run dev -w apps/web` → frontend su localhost:3000
- `docker compose up --build` → Redis + processor su localhost:8000
- `curl http://localhost:8000/health` → `{"status":"ok"}`
- `npm test -w apps/web` → vitest smoke test passa
- pytest nel processor → health test passa

---

## File critici da creare

| File | Scopo |
|------|-------|
| `package.json` (root) | Monorepo workspace config |
| `apps/web/` (scaffolded) | Next.js 16 app |
| `apps/web/src/lib/supabase/server.ts` | Server Supabase client |
| `apps/web/src/lib/supabase/client.ts` | Browser Supabase client |
| `apps/web/src/middleware.ts` | Auth session refresh |
| `apps/processor/src/main.py` | FastAPI entry point |
| `apps/processor/src/config/settings.py` | Pydantic settings |
| `apps/processor/src/api/routes.py` | Health + process endpoints |
| `apps/processor/Dockerfile` | Docker build |
| `apps/processor/pyproject.toml` | Python deps + ruff config |
| `supabase/migrations/*_initial_schema.sql` | DB schema completo |
| `apps/web/src/types/database.types.ts` | Types generati da Supabase |

## Risorse esistenti da riusare
- `docs/database-schema.md` → SQL esatto per la migration
- `docker-compose.yml` → già configurato, solo rimuovere `version`
- `.env` → credenziali Supabase e Redis già presenti
- `.env.example` → template completo

## Gotchas & Lessons Learned
- Storage buckets non creabili via SQL → creare da Dashboard
- `supabase link` richiede TTY login (o `SUPABASE_ACCESS_TOKEN` env var)
- Tailwind v4 usa config CSS-based, non tailwind.config.ts
- `create-next-app` crea un `.git` annidato → rimuoverlo nel monorepo
- `shadcn init --yes` si blocca, usare `--defaults`
- FastAPI `on_event` deprecato → usare `lifespan` con `asynccontextmanager`
- Docker Compose v2 non richiede `version` field

## Stato: COMPLETATO
Data completamento: 2026-03-17
