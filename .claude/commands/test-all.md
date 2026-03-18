---
description: "Esegui tutti i test del progetto (frontend + backend) con fix loop automatico. Usa dopo aver scritto codice, prima di un commit, o per verificare che nulla sia rotto."
---

# VideoCut Test Runner

Esegui tutti i test del monorepo con fix automatico.

## Istruzioni

### Step 1: Frontend Tests

Esegui:
```bash
npm test -w apps/web
```

- Framework: Vitest 4 + React Testing Library
- Config: `apps/web/vitest.config.ts`
- Setup: `apps/web/src/test/setup.ts`
- Pattern: `src/**/*.test.{ts,tsx}`

### Step 2: Backend Tests

Esegui:
```bash
cd apps/processor && uv run python -m pytest -v
```

- Framework: pytest 8 + pytest-asyncio
- Config: `apps/processor/pyproject.toml` (asyncio_mode = auto)
- Conftest: `apps/processor/tests/conftest.py` (stubs moduli ML pesanti)
- Pattern: `tests/test_*.py`

### Step 2b: Type Checks

Esegui in parallelo ai test:
```bash
# Frontend — TypeScript strict mode
cd apps/web && npx tsc --noEmit

# Backend — Ruff linter
cd apps/processor && uv run ruff check src/
```

Se ci sono errori di tipo o lint:
- Type error TypeScript → fixa il tipo, mai usare `any` o `as unknown as X`
- Ruff error → fixa seguendo la regola indicata (es. F841 unused var → rimuovi)
- Se un ruff rule è genuinamente sbagliata per il contesto, spiega PERCHÉ prima di aggiungere `# noqa`

### Step 3: Analisi Risultati

Per ogni test fallito:
1. Leggi l'output completo dell'errore
2. Identifica il file e la funzione che fallisce
3. Leggi il codice del test E il codice sotto test (entrambi!)
4. Determina se il bug è nel test o nel codice di produzione
5. Se il bug è nel codice: fixa il codice, mai il test
6. Se il test è genuinamente sbagliato: spiega PERCHÉ prima di correggerlo

### Step 4: Fix Loop (max 3 iterazioni)

Per ogni fallimento:
1. Applica la fix minimale e mirata
2. Ri-esegui SOLO il test fallito per verificare rapidamente:
   - Frontend: `npx vitest run src/path/to/test.test.ts` (dalla directory apps/web)
   - Backend: `uv run python -m pytest tests/test_specifico.py::TestClass::test_method -v`
3. Se passa, ri-esegui la suite completa per verificare nessuna regressione
4. Se fallisce ancora, analizza di nuovo (forse la fix ha rivelato un altro problema)

Se dopo 3 iterazioni ci sono ancora fallimenti, FERMATI e presenta:
- Lista test che ancora falliscono con output completo
- Analisi del problema root cause
- Proposta di fix per l'utente

### Step 5: Report Finale

Presenta un report chiaro:

```
═══════════════════════════════════
  VideoCut Test Report
═══════════════════════════════════
  Frontend (Vitest):  X/Y passed ✓
  Backend  (pytest):  X/Y passed ✓
  TypeScript (tsc):   ✓ clean / ✗ N errors
  Python (ruff):      ✓ clean / ✗ N errors
  ─────────────────────────────────
  Total tests:        X/Y passed
  Type/lint errors:   N
  Fix applicate:      N
═══════════════════════════════════
```

Se ci sono stati fix, elenca brevemente cosa è stato corretto.

## Regole

- Mai modificare un test solo per farlo passare senza capire il root cause
- Mai commentare o skippare un test che fallisce
- Mai introdurre `any` in TypeScript per far passare un type check
- Mai disabilitare linting rules per far passare un check
- Se un test richiede una fixture/mock mancante, creala correttamente
- Se un test backend fallisce per import ML (torch, whisper, etc.), verifica che conftest.py li stubi
