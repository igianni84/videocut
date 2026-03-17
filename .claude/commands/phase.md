---
description: "Esegui una fase del progetto VideoCut. Uso: /phase <numero> (es. /phase 0)"
---

# VideoCut — Phase Runner

Sei incaricato di eseguire una fase specifica del progetto VideoCut.

## Istruzioni

1. **Leggi il contesto:** Prima di tutto, leggi questi file per avere il quadro completo:
   - `CLAUDE.md` — regole, convenzioni, stato corrente, reference index
   - `tasks/plans/master-plan.md` — piano completo, tech stack, tiers, invarianti, gotchas
   - `tasks/todo.md` — checklist delle fasi
   - `tasks/lessons.md` — errori da non ripetere
   - `docs/architecture.md` — architettura, diagramma, file tree
   - Il piano dettagliato della fase in `tasks/plans/phase-*.md` (se esiste)

2. **Identifica la fase:** L'utente ha richiesto la fase: $ARGUMENTS
   - Se non specificata, chiedi quale fase eseguire
   - Se la fase precedente non è completata, avvisa l'utente

3. **Entra in Plan Mode:** Per ogni fase:
   - Presenta il piano dettagliato dei task della fase
   - Chiedi conferma prima di procedere
   - Identifica eventuali prerequisiti mancanti (env vars, servizi, etc.)

4. **Esegui la fase:** Per ogni task nella fase:
   - Implementa il codice necessario
   - Usa subagenti per ricerche e task paralleli
   - Aggiorna il checkbox in `tasks/todo.md` quando completato
   - Se incontri un blocco, FERMATI e ripianifica

5. **Test & Fix Loop (automatico):** Al termine dell'implementazione:
   - Esegui TUTTI i test: `npm test -w apps/web` e `cd apps/processor && uv run python -m pytest`
   - Se un test fallisce: analizza l'errore, correggi il codice, ri-esegui i test
   - Ripeti fino a quando tutti i test passano (max 3 iterazioni, poi chiedi all'utente)
   - NON procedere finché tutti i test non sono verdi

6. **Allinea Documentazione (automatico):** Dopo che tutti i test passano:
   - `tasks/todo.md` — segna i checkbox completati
   - `CLAUDE.md` → aggiorna "Stato Corrente" (ultima fase completata, prossima fase)
   - `tasks/plans/master-plan.md` → aggiorna "Stato Progetto"
   - `docs/` → aggiorna se la fase ha introdotto nuove API, schema, architettura, pipeline
   - `tasks/lessons.md` → aggiungi se hai imparato qualcosa di nuovo

7. **Commit & Push (automatico):** Dopo documentazione allineata:
   - `git add` dei file modificati (mai file sensibili: .env, credentials, etc.)
   - Commit con messaggio descrittivo: `Phase N: <summary>`
   - `git push origin <branch-corrente>`
   - Summary finale per l'utente con cosa è stato fatto

## Regole

- NON saltare test — ogni fase DEVE terminare con test verdi
- NON procedere alla fase successiva senza aver completato quella corrente
- Se manca una env var, chiedi all'utente PRIMA di procedere
- Usa sempre le versioni specificate nel CLAUDE.md
- Ogni file creato deve avere il suo test
- Prefer librerie esistenti al codice custom
