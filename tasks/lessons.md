# VideoCut — Lessons Learned

Questo file viene aggiornato dopo ogni correzione o problema riscontrato.
Ogni lezione include: cosa è successo, perché, come evitarlo in futuro.

---

## Fase 0

### 1. `create-next-app` crea un `.git` annidato
- **Cosa:** `npx create-next-app` inizializza un repo git nella sub-directory
- **Problema:** Conflitto con il git root del monorepo
- **Fix:** Rimuovere `apps/web/.git` dopo lo scaffold

### 2. shadcn/ui `init --yes` non basta
- **Cosa:** `npx shadcn@latest init --yes` si blocca su prompt interattivo (Radix vs Base)
- **Fix:** Usare `--defaults` invece di `--yes`

### 3. FastAPI `on_event` deprecato
- **Cosa:** `@app.on_event("startup")` genera DeprecationWarning
- **Fix:** Usare il pattern `lifespan` con `@asynccontextmanager`

### 4. `supabase link` richiede TTY
- **Cosa:** Non funziona in ambienti non-TTY (come Claude Code)
- **Fix:** Eseguire manualmente in terminale, oppure settare `SUPABASE_ACCESS_TOKEN`

### 5. Docker Compose `version` deprecato
- **Cosa:** Il campo `version: "3.8"` genera warning
- **Fix:** Rimuoverlo — Docker Compose v2 non lo richiede più
