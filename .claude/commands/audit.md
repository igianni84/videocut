---
description: "Audit completo del progetto VideoCut. Usa prima di un rilascio, dopo una fase completata, o per una review generale della code quality e sicurezza."
---

# VideoCut Project Audit

Esegui un audit completo del progetto su 7 dimensioni. Per ognuna, usa subagenti per parallelizzare l'analisi.

## Istruzioni

1. **Lancia subagenti** per analizzare ogni dimensione in parallelo
2. **Raccogli i risultati** e compila il report finale
3. **Prioritizza i finding** per severità (P0 critico → P2 miglioramento)

## Dimensione 1: Security

### Frontend
- Nessun secret esposto nel client bundle (cerca `SUPABASE_SERVICE_ROLE_KEY`, `STRIPE_SECRET_KEY` in file non-server)
- Middleware auth attivo su tutte le route protette (`(dashboard)/*`)
- Input sanitization su tutti i form (XSS prevention)
- Rate limiting su API routes (es. MAX_CONCURRENT_JOBS)
- CORS configurato correttamente
- Nessun `dangerouslySetInnerHTML` senza sanitize

### Backend
- API key verification su `/api/process` (header `x-api-key`)
- Nessun secret in logs o error messages
- Input validation su job_id, video_storage_path (no path traversal: `..`, `~`)
- Temp file isolation per job
- Timeout su ogni operazione esterna (FFmpeg, HTTP, DB)

### Database
- RLS policies attive su TUTTE le tabelle (profiles, videos, jobs, subscription_events)
- Service role key usato SOLO in `lib/supabase/admin.ts` e backend
- Nessuna query SQL raw senza parametri
- subscription_events accessibile solo a service role

## Dimensione 2: Performance

### Frontend
- Bundle size: cerca dipendenze pesanti inutili in package.json
- `next/image` per tutte le immagini
- Route-based code splitting (default App Router)
- Realtime subscription cleanup (useEffect return)
- No memory leak (subscription, event listener cleanup)

### Backend
- FFmpeg encoding params ottimali (crf=23, preset=medium per balance qualità/velocità)
- Singleton per servizi pesanti (VAD, Whisper — lazy init)
- max_jobs=2 per worker (non sovraccaricare CPU)
- Temp file cleanup puntuale (no disk bloat)
- Redis connection pool (lifespan context)

### Database
- Indici su: videos(user_id, status), jobs(user_id, video_id, status)
- Query N+1 assenti (verifica API routes che fanno multiple query)
- Realtime abilitato solo su `jobs` (non su tutte le tabelle)

## Dimensione 3: Code Quality

### TypeScript
- `strict: true` in tsconfig.json
- Zero `any` types (grep per `: any` e `as any`)
- Generated types aggiornati (`database.types.ts` vs migrations)
- Error handling consistente (try/catch con messaggi specifici)
- No `console.log` in produzione (solo in test)

### Python
- Ruff clean: `ruff check apps/processor/src/`
- Type hints su tutte le funzioni pubbliche
- Nessun `print()` — solo `logging` module
- No `# type: ignore` senza commento esplicativo
- Import organizzati (isort/ruff I)

## Dimensione 4: Test Coverage

- Ogni API route (`apps/web/src/app/api/`) ha almeno 1 test
- Ogni service (`apps/processor/src/services/`) ha unit tests
- Error paths testati (401, 404, 429, 500, 502, 503)
- Validation logic testata (file type, size, duration per tier)
- Worker pipeline testato end-to-end (con mock)
- Identifica file/funzioni SENZA test e segnala

## Dimensione 5: Architecture Alignment

Verifica rispetto a `tasks/plans/master-plan.md` e `CLAUDE.md`:
- Struttura file rispetta convenzioni (components/{feature}/, api/{resource}/, services/{name}.py)
- Separation of concerns (API → Service → Worker, no logica business nelle route)
- Nessun accoppiamento diretto frontend ↔ processor (solo via Supabase + HTTP)
- Supabase come hub centrale (storage, DB, realtime, auth)
- Invarianti master-plan rispettate (original never modified, tier limits, timeout 5min, etc.)

## Dimensione 6: Documentation Sync

Verifica che i docs riflettano il codice ATTUALE:
- `docs/api-spec.md` — tutte le route attuali documentate
- `docs/database-schema.md` — allineato a `supabase/migrations/`
- `docs/processing-pipeline.md` — riflette pipeline in `workers/process_video.py`
- `docs/architecture.md` — riflette stato corrente del sistema
- `tasks/todo.md` — fasi completate segnate
- `CLAUDE.md` — "Stato Corrente" aggiornato

## Dimensione 7: Dependencies & Supply Chain

### Frontend
- `npm audit` — zero vulnerabilità high/critical
- Dipendenze outdated: `npm outdated` — verifica major version gap
- Bundle size check: dipendenze pesanti non necessarie (es. lodash intero vs lodash-es, moment vs date-fns)
- No duplicate packages in lock file (versioni multiple della stessa lib)
- `devDependencies` vs `dependencies` corretti (test libs non in dependencies)

### Backend
- `uv run pip-audit` o `uv run safety check` — zero vulnerabilità note
- Dipendenze pinned in `requirements.txt` o `pyproject.toml` (no range aperti per prod)
- No dipendenze inutilizzate (grep import vs installed packages)
- Python version compatibilità (verifica `requires-python` in pyproject.toml)

### Env Vars
- `.env.example` esiste e documenta TUTTE le env vars necessarie
- Nessuna env var usata nel codice che manca da `.env.example`
- Secret env vars (keys, tokens) hanno placeholder, non valori reali

## Report Finale

Per ogni dimensione, fornisci:

```
═══════════════════════════════════════
  VideoCut Audit Report
═══════════════════════════════════════

  1. Security          🟢 OK / 🟡 Attenzione / 🔴 Critico
  2. Performance       🟢 / 🟡 / 🔴
  3. Code Quality      🟢 / 🟡 / 🔴
  4. Test Coverage     🟢 / 🟡 / 🔴
  5. Architecture      🟢 / 🟡 / 🔴
  6. Documentation     🟢 / 🟡 / 🔴
  7. Dependencies      🟢 / 🟡 / 🔴

  ─────────────────────────────────────
  Findings totali: N
    P0 (critico):      X
    P1 (importante):   Y
    P2 (miglioramento): Z
═══════════════════════════════════════
```

Poi elenca ogni finding con: dimensione, priorità, file:linea, descrizione, fix suggerita.
