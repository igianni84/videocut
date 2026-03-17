## Workflow Orchestration

### 1. Plan Mode Default
- Enter plan mode for ANY non-trivial task (3+ steps or architectural decisions)
- If something goes sideways, STOP and re-plan immediately – don't keep pushing
- Use plan mode for verification steps, not just building
- Write detailed specs upfront to reduce ambiguity

### 2. Subagent Strategy
- Use subagents liberally to keep main context window clean
- Offload research, exploration, and parallel analysis to subagents
- For complex problems, throw more compute at it via subagents
- One task per subagent for focused execution

### 3. Self-Improvement Loop
- After ANY correction from the user: update `tasks/lessons.md` with the pattern
- Write rules for yourself that prevent the same mistake
- Ruthlessly iterate on these lessons until mistake rate drops
- Review lessons at session start for relevant project

### 4. Verification Before Done
- Non inventare nomi di variabili, funzioni, classi o altro, verifica sempre la loro esistenza prima di usarle
- Never mark a task complete without proving it works
- Diff behavior between main and your changes when relevant
- Ask yourself: "Would a staff engineer approve this?"
- Run tests, check logs, demonstrate correctness

### 5. Demand Elegance (Balanced)
- For non-trivial changes: pause and ask "is there a more elegant way?"
- If a fix feels hacky: "Knowing everything I know now, implement the elegant solution"
- Skip this for simple, obvious fixes – don't over-engineer
- Challenge your own work before presenting it

### 6. Autonomous Bug Fixing
- When I report a bug, don't start by trying to fix it. Instead, start by writing a test that reproduces the bug. Then, have subagents try to fix the bug and prove it with a passing test.
- Point at logs, errors, failing tests – then resolve them
- Zero context switching required from the user
- Go fix failing CI tests without being told how

## Task Management

1. **Plan First:** Write plan to `tasks/todo.md` with checkable items
2. **Verify Plan:** Check in before starting implementation
3. **Track Progress:** Mark items complete as you go
4. **Explain Changes:** High-level summary at each step
5. **Document Results:** Add review section to `tasks/todo.md`
6. **Capture Lessons:** Update `tasks/lessons.md` after corrections

## Core Principles

- **Simplicity First:** Make every change as simple as possible. Impact minimal code.
- **No Laziness:** Find root causes. No temporary fixes. Senior developer standards.
- **Minimal Impact:** Changes should only touch what's necessary. Avoid introducing bugs.

## Project Context

### What This Is
**VideoCut** — SaaS per content creator che automatizza l'editing video: rimozione pause, sottotitoli dinamici word-by-word, rimozione filler words, speed control, smart crop con face detection. Freemium model con Stripe.

### Tech Stack
- **Frontend:** Next.js 16 (App Router), React 19, TypeScript 5.9, Tailwind CSS 4.2, shadcn/ui
- **Auth & DB:** Supabase (Auth magic link + Google + Apple, PostgreSQL, Storage, Realtime)
- **Payments:** Stripe (Checkout, Customer Portal, Webhooks)
- **Video Processing:** Python 3.13 service (FastAPI, arq worker)
- **ASR/NLP:** CrisperWhisper (speech-to-text + word timestamps + filler detection)
- **Audio Analysis:** Silero VAD (voice activity detection)
- **Video Manipulation:** FFmpeg 8 (cut, speed, crop, subtitle burn-in)
- **Face Detection:** MediaPipe (smart crop)
- **Subtitles:** ASS/SSA format con karaoke tags (\K) per animazione word-by-word
- **Queue:** Redis (Upstash serverless) + arq (Python async task queue)
- **Hosting:** Vercel (frontend), Railway (processing service), Upstash (Redis)
- **Testing:** Vitest + Playwright (frontend), pytest (processing)
- **Node.js:** 25

### Module Map

| Module | Purpose | Phase |
|--------|---------|-------|
| Infrastructure | Monorepo setup, env config, CI/CD, Docker dev | Phase 0 |
| Auth | Supabase Auth (magic link, Google, Apple), user profiles, RLS | Phase 1 |
| Upload & Storage | Video upload, validation, Supabase Storage, progress tracking | Phase 2 |
| Processing Core | Audio extraction, CrisperWhisper transcription, silence detection, video cutting, job queue | Phase 3 |
| Dynamic Subtitles | ASS generation, karaoke animation, customization (font/color/size/position), multi-lingua, burn-in | Phase 4 |
| Advanced Processing | Speed control, filler word removal, format/crop, smart crop (face detection), platform safe zones | Phase 5 |
| Preview & Download | In-browser preview, multi-resolution download, progress UI, notifiche email | Phase 6 |
| Monetization | Stripe subscriptions, free/pro tier enforcement, Customer Portal, webhooks | Phase 7 |
| Polish & Launch | Landing page, onboarding, error handling, performance, GDPR, monitoring | Phase 8 |

### Architecture

```
┌────────────────────┐      ┌───────────────┐      ┌─────────────────────┐
│  Next.js 16        │      │  Supabase     │      │  Python Service     │
│  (Vercel)          │◄────▶│  (Cloud)      │◄────▶│  (Railway)          │
│                    │      │               │      │                     │
│  - UI/UX           │      │  ┌──────────┐ │      │  - FastAPI (API)    │
│  - Auth flow       │      │  │PostgreSQL│ │      │  - arq (job queue)  │
│  - Upload trigger  │      │  │(users,   │ │      │  - CrisperWhisper   │
│  - Stripe billing  │      │  │jobs,     │ │      │  - FFmpeg 8         │
│  - Preview player  │      │  │subs)     │ │      │  - MediaPipe        │
│  - Download        │      │  └──────────┘ │      │  - Silero VAD       │
└────────────────────┘      │  ┌──────────┐ │      │                     │
                            │  │Storage   │ │      │  ┌───────────────┐  │
┌────────────────────┐      │  │(video    │ │      │  │ Redis/Upstash │  │
│  Stripe            │      │  │files)    │ │      │  │ (job queue)   │  │
│  (Payments)        │◄────▶│  └──────────┘ │      │  └───────────────┘  │
└────────────────────┘      │  ┌──────────┐ │      └─────────────────────┘
                            │  │Realtime  │ │
                            │  │(job      │ │
                            │  │status)   │ │
                            │  └──────────┘ │
                            └───────────────┘
```

**Flusso dati:**
1. User upload video → Supabase Storage (signed URL da API route)
2. Next.js API route → crea job in Supabase DB (status: `queued`) + push a Redis
3. Python arq worker consuma da Redis → scarica video → processa → upload risultato
4. Worker aggiorna status in Supabase DB (`processing` → `completed`/`failed`)
5. Frontend riceve update via Supabase Realtime → mostra preview → download

### Key Invariants (NEVER violate)
1. **Video originale MAI modificato** — sempre creare un nuovo file processato
2. **Free tier: max 60s input, max 1080p output** — enforced sia frontend che backend
3. **Pro tier: max 3min input, max 4K output** — verificare subscription attiva prima del processing
4. **Job processing è idempotent** — se fallisce e riprova, produce lo stesso risultato
5. **Cleanup obbligatorio** — file temporanei cancellati dopo processing, video processati dopo 30 giorni
6. **Auth required per qualsiasi upload/processing** — nessuna operazione anonima
7. **Stripe è source of truth per lo stato subscription** — sync via webhook, mai hardcoded
8. **Processing timeout: 5 minuti** — se il job non completa, fallisce con errore

### Coding Conventions
- **Monorepo structure:** `apps/web/` (Next.js), `apps/processor/` (Python)
- **Frontend components:** `apps/web/src/components/{feature}/ComponentName.tsx`
- **API routes:** `apps/web/src/app/api/{resource}/route.ts`
- **Python services:** `apps/processor/src/services/{service_name}.py`
- **Python models:** `apps/processor/src/models/{model_name}.py`
- **Shared types:** definiti in Supabase schema, generati con `supabase gen types`
- **Environment vars:** `.env.local` (frontend), `.env` (processor), `.env.example` (template committato)
- **Error handling:** Result pattern (`{success, data, error}`) per le API, eccezioni tipizzate in Python
- **Naming:** camelCase (TS), snake_case (Python), kebab-case (file/folder frontend)
- **No `any` in TypeScript** — usare tipi specifici o `unknown`
- **No `print()` in Python** — usare `logging` module
- **Video processing:** sempre FFmpeg via subprocess, mai librerie wrapper (più controllo, meno bug)

### Tier & Limiti

| | Free | Pro (€10/mese o €100/anno) |
|---|---|---|
| Durata input | Max 60 secondi | Max 3 minuti |
| Risoluzione output | Max 1080p | Max 4K |
| Watermark | No | No |
| Tutte le feature | Sì | Sì |
| Processing priority | Normale | Alta (Redis priority queue) |

### Lingue supportate (sottotitoli)
IT, EN, ES, FR, DE, PT

### PRD & Task Files
- Piano fasi: `tasks/todo.md`
- Lesson learned: `tasks/lessons.md`
- Architettura: `docs/architecture.md`
- Pipeline processing: `docs/processing-pipeline.md`
- Schema database: `docs/database-schema.md`
- Specifiche API: `docs/api-spec.md`

## Server & Infrastructure

### Hosting
- **Frontend:** Vercel (auto-deploy da branch `main`, root: `apps/web/`)
- **Processing Service:** Railway (auto-deploy da branch `main`, root: `apps/processor/`)
- **Database + Auth + Storage:** Supabase Cloud
- **Redis:** Upstash (serverless Redis)
- **Payments:** Stripe

### Environment Variables
Vedi `.env.example` per la lista completa. Principali:
- `NEXT_PUBLIC_SUPABASE_URL` / `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`
- `STRIPE_SECRET_KEY` / `STRIPE_WEBHOOK_SECRET` / `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY`
- `PROCESSING_SERVICE_URL` / `PROCESSING_API_KEY`
- `UPSTASH_REDIS_URL`
- Google/Apple OAuth client IDs e secrets (configurati in Supabase dashboard)

### Git Repo
- **Repo:** `github.com/igianni84/videocut`
- **Branch strategy:** `main` (production), `develop` (staging), `feature/*` (feature branches)

### Known Gotchas
- FFmpeg deve essere installato nel container Railway (Dockerfile con `apt-get install ffmpeg`)
- CrisperWhisper richiede ~2GB di VRAM per `large-v3` o ~4GB RAM CPU-only — Railway deve avere almeno 4GB RAM
- Supabase Storage ha un limite di 50MB per file sul piano gratuito — considerare upload chunked per video grandi
- Vercel ha un timeout di 60s sulle API routes — l'upload deve andare direttamente a Supabase Storage, non transitare dal server Next.js
- Upstash Redis ha limiti di connessioni concorrenti sul piano gratuito — monitorare in produzione
- ASS subtitle rendering può variare tra versioni di libass — testare sempre sulla build FFmpeg di produzione
- I sottotitoli dinamici con molte parole possono causare lag — limitare a 5 parole per riga su formato verticale

### Claude Code Skills installate
```bash
# Tier 1 — Core
npx skillsadd supabase/agent-skills/supabase-postgres-best-practices
npx skillsadd vercel-labs/next-skills/next-best-practices
npx skillsadd wshobson/agents/nextjs-app-router-patterns
npx skillsadd vercel-labs/agent-skills/vercel-react-best-practices
npx skillsadd vercel-labs/agent-skills/deploy-to-vercel
npx skillsadd wshobson/agents/typescript-advanced-types

# Tier 2 — Utili
npx skillsadd wshobson/agents/tailwind-design-system
npx skillsadd shadcn/ui/shadcn
npx skillsadd anthropics/skills/webapp-testing
npx skillsadd currents-dev/playwright-best-practices-skill/playwright-best-practices
npx skillsadd wshobson/agents/python-testing-patterns
npx skillsadd wshobson/agents/python-performance-optimization
npx skillsadd supercent-io/skills-template/security-best-practices
```
