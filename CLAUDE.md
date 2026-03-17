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
7. **Post-fase (automatico):** test → fix loop → allinea docs (todo, stato corrente, master-plan, docs/) → commit & push. Dettagli in `.claude/commands/phase.md`

## Core Principles

- **Simplicity First:** Make every change as simple as possible. Impact minimal code.
- **No Laziness:** Find root causes. No temporary fixes. Senior developer standards.
- **Minimal Impact:** Changes should only touch what's necessary. Avoid introducing bugs.

## Project Context

**VideoCut** — SaaS per content creator che automatizza l'editing video (rimozione pause, sottotitoli dinamici, filler removal, speed control, smart crop). Piano completo → `tasks/plans/master-plan.md`.

### Stato Corrente
| | |
|---|---|
| **Ultima fase completata** | Phase 6 — Preview & Download (2026-03-17) |
| **Prossima fase** | Phase 7 — Stripe Integration & Monetization |

### Reference Index

| Cosa | Dove |
|------|------|
| Piano completo, tech stack, tiers, invarianti, gotchas | `tasks/plans/master-plan.md` |
| Architettura, diagramma, data flow, file tree | `docs/architecture.md` |
| Schema DB (prosa + rationale RLS) | `docs/database-schema.md` |
| SQL effettivo (source of truth) | `supabase/migrations/20260317000000_initial_schema.sql` |
| Pipeline processing | `docs/processing-pipeline.md` |
| Specifiche API | `docs/api-spec.md` |
| Todo/checklist fasi | `tasks/todo.md` |
| Lesson learned | `tasks/lessons.md` |
| Piani dettagliati per fase | `tasks/plans/phase-*.md` |

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
- **Lingue sottotitoli:** IT, EN, ES, FR, DE, PT

### Git

- **Repo:** `github.com/igianni84/videocut`
- **Branch strategy:** `main` (production), `feature/*` (feature branches)

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
