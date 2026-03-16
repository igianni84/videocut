---
description: "Esegui una fase del progetto VideoCut. Uso: /phase <numero> (es. /phase 0)"
---

# VideoCut — Phase Runner

Sei incaricato di eseguire una fase specifica del progetto VideoCut.

## Istruzioni

1. **Leggi il contesto:** Prima di tutto, leggi questi file per avere il quadro completo:
   - `CLAUDE.md` — regole del progetto e tech stack
   - `tasks/todo.md` — piano completo delle fasi
   - `tasks/lessons.md` — errori da non ripetere
   - `docs/architecture.md` — architettura di sistema
   - Il documento specifico della fase richiesta in `tasks/todo.md`

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

5. **Verifica:** Al termine della fase:
   - Esegui TUTTI i test elencati nella fase
   - Verifica che ogni test passi
   - Se un test fallisce, correggi prima di procedere

6. **Documenta:** Dopo la verifica:
   - Aggiorna la documentazione in `docs/` se necessario
   - Aggiorna `tasks/todo.md` con i checkbox completati
   - Se hai imparato qualcosa di nuovo, aggiorna `tasks/lessons.md`
   - Fai un summary finale di cosa è stato fatto

7. **Commit:** Proponi un commit con messaggio descrittivo della fase completata.

## Regole

- NON saltare test — ogni fase DEVE terminare con test verdi
- NON procedere alla fase successiva senza aver completato quella corrente
- Se manca una env var, chiedi all'utente PRIMA di procedere
- Usa sempre le versioni specificate nel CLAUDE.md
- Ogni file creato deve avere il suo test
- Prefer librerie esistenti al codice custom
