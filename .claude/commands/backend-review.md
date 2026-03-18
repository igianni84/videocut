---
description: "Review del backend Python/FastAPI. Usa quando modifichi codice in apps/processor/, crei nuovi service/worker, o prima di un deploy backend."
---

# VideoCut Backend Review

Esegui una review approfondita del codice backend (`apps/processor/`).

## Istruzioni

1. **Identifica i file modificati:** Usa `git diff --name-only` per trovare i file backend cambiati.
   - Se l'utente specifica file, concentrati su quelli
   - Se non specificato, analizza tutti i file modificati in `apps/processor/`

2. **Leggi il contesto:** Per ogni file modificato, leggi anche i file correlati (test, import, caller).

3. **Applica la checklist** sotto a ogni file/funzione modificata.

4. **Report finale:** Per ogni finding, indica file:linea, problema, fix suggerita.

## Checklist

### Pattern Async
- `asyncio.create_subprocess_exec()` per FFmpeg (mai `subprocess.run` o `subprocess.call`)
- `asyncio.to_thread()` per funzioni sync-heavy (VAD, transcription, face detection)
- `httpx.AsyncClient` per HTTP calls (mai `requests`)
- Nessun blocking I/O nel event loop (mai `time.sleep`, `open().read()` su file grandi)
- `asyncio.wait_for()` con timeout su operazioni lunghe

### FFmpeg
- Comandi costruiti come lista di argomenti (mai string concatenation o shell=True)
- Encoding defaults: libx264, preset=medium, crf=23, AAC 128k
- Temp files cleanup in caso di errore (try/finally)
- Timeout su subprocess
- stderr catturato per debug

### arq Workers
- max_jobs rispettato (default 2)
- job_timeout = processing_timeout_seconds + buffer
- Error handling con `_handle_failure()` (aggiorna job status + video status)
- Job status aggiornato a ogni step (progress 0-100%)
- Retry logic corretta (retry_count incrementato)

### Supabase Client
- Singleton pattern per client (`_get_client()`)
- Service role key solo server-side
- Error handling su ogni operazione DB
- Status updates atomiche (job + video)
- Nessuna query senza filtro user_id (RLS)

### Error Handling & Logging
- `logging.getLogger(__name__)` (mai `print()`)
- Try/catch con log dell'eccezione completa (`logger.exception()`)
- Cleanup temp files in finally block
- Graceful degradation (es. notification failure non blocca il job)
- Error messages specifiche (no generic "something went wrong")

### Models & Validation
- Pydantic models per input/output
- pydantic-settings per config (mai os.environ diretto)
- Type hints su tutte le funzioni
- Nessun `Any` type

### Security
- API key verification su ogni endpoint esposto
- Nessun secret hardcoded o in log
- Input validation (file paths, job IDs — no path traversal)
- Temp directory isolation per job (`/tmp/videocut/{job_id}/`)

### Memory & Resource Management
- Video file streaming vs full load in memory (file grandi → streaming obbligatorio)
- Temp directory size: verifica che non accumuli file tra job (cleanup in finally)
- FFmpeg memory: `-threads` limitato, evita encoding paralleli sullo stesso worker
- File handle leaks: ogni `open()` deve essere in `with` o in `async with`
- Large video safeguard: reject/warn per video > tier limit PRIMA di scaricarli

### Health & Lifecycle
- Health endpoint (`/health`) — risponde 200 se il servizio è operativo
- Startup check: verifica che FFmpeg, Redis, Supabase siano raggiungibili all'avvio
- Graceful shutdown: arq worker chiude job in corso prima di terminare (`handle_signals=True`)
- Liveness vs readiness: se deployato su K8s/Railway, servono entrambi i probe
- Lifespan context: risorse inizializzate in `@asynccontextmanager` lifespan, non a livello di modulo

### ML Models (CrisperWhisper, VAD, Face Detection)
- Lazy loading: modelli caricati al primo uso, non all'avvio del worker
- Error isolation: fallimento ML non deve crashare il worker intero (try/except + fallback)
- Memory cleanup: `del model` + `gc.collect()` dopo uso se il modello è pesante
- Timeout dedicato: transcription e face detection hanno timeout separati da FFmpeg
- Fallback strategy: se Whisper fallisce, il job può completare senza sottotitoli (degradation)
- Device check: verifica GPU availability al startup, fallback a CPU con log warning
