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
│   │   │   ├── app/                  # App Router pages & API routes
│   │   │   │   ├── (auth)/           # Auth pages (login, signup, callback)
│   │   │   │   ├── (dashboard)/      # Protected dashboard pages
│   │   │   │   ├── api/              # API routes
│   │   │   │   │   ├── jobs/         # Job creation, status
│   │   │   │   │   ├── upload/       # Signed URL generation
│   │   │   │   │   └── webhooks/     # Stripe webhooks
│   │   │   │   └── layout.tsx
│   │   │   ├── components/           # UI components
│   │   │   │   ├── ui/               # shadcn/ui components
│   │   │   │   ├── auth/             # Auth-related components
│   │   │   │   ├── upload/           # Upload components
│   │   │   │   ├── editor/           # Video editor/preview
│   │   │   │   └── billing/          # Stripe/pricing components
│   │   │   ├── lib/                  # Utilities
│   │   │   │   ├── supabase/         # Supabase client setup
│   │   │   │   ├── stripe/           # Stripe helpers
│   │   │   │   └── utils.ts
│   │   │   └── types/                # TypeScript types (generated + custom)
│   │   ├── public/
│   │   ├── next.config.ts
│   │   ├── tailwind.config.ts
│   │   ├── tsconfig.json
│   │   └── package.json
│   │
│   └── processor/                    # Python processing service
│       ├── src/
│       │   ├── api/                  # FastAPI endpoints
│       │   │   └── routes.py
│       │   ├── workers/              # arq job workers
│       │   │   └── video_worker.py
│       │   ├── services/             # Business logic
│       │   │   ├── transcription.py  # CrisperWhisper
│       │   │   ├── silence.py        # Silero VAD + pause detection
│       │   │   ├── subtitles.py      # ASS generation
│       │   │   ├── video.py          # FFmpeg operations
│       │   │   ├── crop.py           # MediaPipe face detection + smart crop
│       │   │   └── filler.py         # Filler word detection
│       │   ├── models/               # Pydantic models
│       │   ├── config/               # Settings, constants
│       │   │   ├── settings.py       # Env vars via pydantic-settings
│       │   │   ├── safe_zones.py     # Platform safe zone constants
│       │   │   └── filler_words.py   # Per-language filler dictionaries
│       │   └── main.py               # FastAPI app entry point
│       ├── tests/
│       ├── Dockerfile
│       ├── pyproject.toml
│       └── requirements.txt
│
├── docs/                             # Documentazione di progetto
│   ├── architecture.md               # Questo file
│   ├── processing-pipeline.md        # Dettaglio pipeline video
│   ├── database-schema.md            # Schema Supabase
│   └── api-spec.md                   # Specifiche API
│
├── tasks/                            # Project management
│   ├── todo.md                       # Piano fasi
│   └── lessons.md                    # Lezioni apprese
│
├── .claude/
│   └── commands/                     # Custom Claude Code skills
│       └── phase.md                  # /phase command
│
├── .env.example                      # Template variabili d'ambiente
├── docker-compose.yml                # Dev locale
├── .gitignore
└── CLAUDE.md                         # Istruzioni per Claude
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
