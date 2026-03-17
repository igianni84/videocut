# VideoCut — Architettura di Sistema

## Overview

VideoCut è composto da tre servizi principali che comunicano attraverso Supabase come hub centrale:

```
┌─────────────────────┐       ┌────────────────────┐       ┌──────────────────────┐
│  FRONTEND           │       │  SUPABASE          │       │  PROCESSING SERVICE  │
│  Next.js 16         │◄─────▶│  (Cloud)           │◄─────▶│  Python / FastAPI    │
│  Vercel             │       │                    │       │  Railway             │
│                     │       │  ┌──────────────┐  │       │                      │
│  Responsabilità:    │       │  │ PostgreSQL   │  │       │  Responsabilità:     │
│  - UI/UX            │       │  │ (users, jobs,│  │       │  - Transcription     │
│  - Auth flow        │       │  │  videos,     │  │       │  - Silence detection │
│  - Upload trigger   │       │  │  subs)       │  │       │  - Video cutting     │
│  - Stripe billing   │       │  └──────────────┘  │       │  - Subtitle gen      │
│  - Video preview    │       │  ┌──────────────┐  │       │  - Smart crop        │
│  - Download         │       │  │ Storage      │  │       │  - Speed control     │
│                     │       │  │ (video files)│  │       │  - Filler removal    │
└─────────────────────┘       │  └──────────────┘  │       │                      │
                              │  ┌──────────────┐  │       │  ┌────────────────┐  │
┌─────────────────────┐       │  │ Auth         │  │       │  │ Redis/Upstash  │  │
│  STRIPE             │       │  │ (magic link, │  │       │  │ (job queue     │  │
│  (Payments)         │◄─────▶│  │  Google,     │  │       │  │  via arq)      │  │
│                     │       │  │  Apple)      │  │       │  └────────────────┘  │
└─────────────────────┘       │  └──────────────┘  │       └──────────────────────┘
                              │  ┌──────────────┐  │
                              │  │ Realtime     │  │
                              │  │ (job status  │  │
                              │  │  updates)    │  │
                              │  └──────────────┘  │
                              └────────────────────┘
```

## Flusso Dati Principale

### Upload & Processing
```
1. User seleziona video nel browser
2. Frontend richiede signed upload URL a Next.js API route
3. Next.js API genera signed URL via Supabase Storage
4. Frontend upload diretto a Supabase Storage (bypass Vercel 60s timeout)
5. Frontend chiama Next.js API: POST /api/jobs {videoId, options}
6. Next.js API:
   a. Valida utente e limiti tier (durata, risoluzione)
   b. Crea record job in Supabase DB (status: "queued")
   c. Pubblica job su Redis (arq queue)
   d. Ritorna jobId al frontend
7. Frontend sottoscrive Supabase Realtime channel per jobId
```

### Processing Pipeline (Python Worker)
```
8. arq worker riceve job da Redis
9. Aggiorna status → "processing" in Supabase DB
10. Download video da Supabase Storage
11. Pipeline di processing (vedi docs/processing-pipeline.md):
    a. Estrai audio → WAV 16kHz mono
    b. Silero VAD → segmenti speech/non-speech
    c. CrisperWhisper → trascrizione + word timestamps + filler tags
    d. Analisi pause e filler words
    e. Taglio silenzi/filler con FFmpeg + crossfade
    f. Genera ASS sottotitoli con karaoke tags
    g. Speed control (se richiesto)
    h. Smart crop con face detection (se cambio formato)
    i. Burn-in sottotitoli + encoding finale
12. Upload video processato su Supabase Storage
13. Aggiorna status → "completed" + URL output in Supabase DB
14. Cleanup file temporanei locali
```

### Preview & Download
```
15. Frontend riceve update Realtime → status "completed"
16. Frontend carica video player con URL output
17. User può scaricare il video processato
```

## Struttura Monorepo

```
VideoCut/
├── apps/
│   ├── web/                          # Next.js 16 frontend
│   │   ├── src/
│   │   │   ├── app/                  # App Router pages
│   │   │   │   ├── globals.css
│   │   │   │   ├── layout.tsx
│   │   │   │   └── page.tsx
│   │   │   ├── components/
│   │   │   │   ├── ui/               # shadcn/ui (button, card, badge, progress, etc.)
│   │   │   │   ├── upload/           # VideoCard, VideoList, UploadZone, etc.
│   │   │   │   ├── jobs/             # ProcessingOptionsDialog, JobStatusBadge, JobProgress
│   │   │   │   ├── subtitles/        # SubtitleCustomizer, SubtitlePreview
│   │   │   │   └── processing/       # SpeedControl, FillerRemoval, FormatSelector
│   │   │   ├── hooks/
│   │   │   │   └── use-job-status.ts # Realtime job subscription
│   │   │   ├── lib/
│   │   │   │   ├── supabase/         # client.ts, server.ts, middleware.ts
│   │   │   │   ├── videos/           # types.ts, actions.ts, validation.ts
│   │   │   │   ├── jobs/             # types.ts, actions.ts
│   │   │   │   ├── subtitles/        # types.ts (SubtitleStyle, font/color/position types)
│   │   │   │   ├── processing/      # types.ts (SpeedMode, FormatPresets, SafeZones, AdvancedOptions)
│   │   │   │   ├── utils.ts
│   │   │   │   └── utils.test.ts
│   │   │   ├── test/
│   │   │   │   └── setup.ts
│   │   │   ├── types/
│   │   │   │   └── database.types.ts # Generated via supabase gen types
│   │   │   └── middleware.ts
│   │   ├── public/                   # Static assets (SVGs)
│   │   ├── components.json           # shadcn/ui config
│   │   ├── eslint.config.mjs
│   │   ├── next.config.ts
│   │   ├── postcss.config.mjs
│   │   ├── tsconfig.json
│   │   ├── vitest.config.ts
│   │   └── package.json
│   │
│   └── processor/                    # Python processing service
│       ├── src/
│       │   ├── api/
│       │   │   ├── dependencies.py   # API key auth
│       │   │   └── routes.py         # Health + process endpoints
│       │   ├── config/
│       │   │   └── settings.py       # Env vars via pydantic-settings
│       │   ├── models/
│       │   │   └── job.py            # Pydantic models (ProcessRequest, VadSegment, SubtitleStyle, ProcessingOptions, etc.)
│       │   ├── services/
│       │   │   ├── supabase_client.py  # Supabase service-role client
│       │   │   ├── ffmpeg.py           # FFmpeg subprocess wrapper (cut, speed, crop, burn)
│       │   │   ├── vad.py              # Silero VAD service
│       │   │   ├── transcription.py    # faster-whisper service
│       │   │   ├── cut_planner.py      # Cut plan algorithm (silence + filler removal)
│       │   │   ├── ass_generator.py    # ASS subtitle generation with karaoke tags
│       │   │   ├── filler_detector.py  # Per-language filler word enrichment
│       │   │   ├── speed_controller.py # Uniform + smart speed with timestamp remapping
│       │   │   ├── safe_zones.py       # Platform safe zone margins for subtitles
│       │   │   └── smart_crop.py       # Face detection + EMA smoothing + sendcmd
│       │   ├── workers/
│       │   │   ├── process_video.py    # arq task (pipeline orchestrator)
│       │   │   └── worker_settings.py  # arq WorkerSettings
│       │   └── main.py               # FastAPI app entry point
│       ├── tests/
│       │   ├── conftest.py            # ML module stubs for testing
│       │   ├── test_health.py
│       │   ├── test_models.py
│       │   ├── test_cut_planner.py
│       │   ├── test_ffmpeg.py
│       │   ├── test_filler_detector.py
│       │   ├── test_speed_controller.py
│       │   ├── test_safe_zones.py
│       │   ├── test_smart_crop.py
│       │   ├── test_routes.py
│       │   └── test_worker.py
│       ├── Dockerfile
│       ├── pyproject.toml
│       └── requirements.txt
│
├── docs/
│   ├── architecture.md               # Questo file
│   ├── processing-pipeline.md
│   ├── database-schema.md
│   └── api-spec.md
│
├── supabase/
│   ├── migrations/
│   │   └── 20260317000000_initial_schema.sql
│   └── config.toml
│
├── tasks/
│   ├── todo.md
│   ├── lessons.md
│   └── plans/
│       ├── master-plan.md
│       └── phase-0-setup.md
│
├── .claude/
│   └── commands/
│       └── phase.md                  # /phase command
│
├── .env.example
├── docker-compose.yml
├── package.json                      # Workspace root
├── package-lock.json
├── .gitignore
└── CLAUDE.md
```

## Decisioni Architetturali

### Perché monorepo?
- Frontend e processing sono strettamente accoppiati logicamente
- Documentazione e configurazione condivise
- CI/CD più semplice da coordinare
- Ma deploy indipendenti (Vercel per web, Railway per processor)

### Perché Supabase come hub?
- Elimina la necessità di API dirette tra frontend e processing service
- Realtime built-in per aggiornamenti di stato
- Storage integrato con auth (signed URLs)
- RLS per multi-tenancy senza codice custom

### Perché arq + Redis (non Celery)?
- arq è async-native (perfetto con FastAPI)
- Più leggero di Celery
- Upstash Redis è serverless (zero gestione)
- Sufficiente per il nostro volume di job

### Perché FFmpeg diretto (non wrapper)?
- Controllo totale sui parametri
- Più facile da debuggare
- Nessuna dipendenza da wrapper potenzialmente non mantenuti
- FFmpeg 8 ha feature native per tutto ciò che serve

### Perché CrisperWhisper (non faster-whisper)?
- Fa speech-to-text + word timestamps + filler detection in un unico passaggio
- Ottimizzato per trascrizione verbatim (non salta filler come fa Whisper standard)
- Riduce complessità pipeline (un modello invece di due)
- Fallback a faster-whisper + WhisperX se necessario
