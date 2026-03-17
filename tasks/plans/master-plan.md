# VideoCut — Master Plan

## Visione
SaaS per content creator che automatizza l'editing video: rimozione pause, sottotitoli dinamici word-by-word, rimozione filler words, speed control, smart crop con face detection. Modello freemium con Stripe.

---

## Stato Progetto

| | |
|---|---|
| **Ultima fase completata** | Phase 3 — Video Processing Pipeline (2026-03-17) |
| **Prossima fase** | Phase 4 — Dynamic Subtitles |

---

## Architettura

_Diagramma dettagliato → `docs/architecture.md`_

**Flusso dati (summary):**
1. User upload video → Supabase Storage (signed URL da API route)
2. Next.js API route → crea job in Supabase DB (status: `queued`) + push a Redis
3. Python arq worker consuma da Redis → scarica video → processa → upload risultato
4. Worker aggiorna status in Supabase DB (`processing` → `completed`/`failed`)
5. Frontend riceve update via Supabase Realtime → mostra preview → download

---

## Tech Stack

| Layer | Tecnologia |
|-------|-----------|
| Frontend | Next.js 16 (App Router), React 19, TypeScript 5.9, Tailwind CSS 4.2, shadcn/ui |
| Auth & DB | Supabase (Auth magic link + Google + Apple, PostgreSQL, Storage, Realtime) |
| Payments | Stripe (Checkout, Customer Portal, Webhooks) |
| Video Processing | Python 3.13 (FastAPI, arq worker) |
| ASR/NLP | CrisperWhisper (speech-to-text + word timestamps + filler detection) |
| Audio Analysis | Silero VAD (voice activity detection) |
| Video Manipulation | FFmpeg 8 (cut, speed, crop, subtitle burn-in) |
| Face Detection | MediaPipe (smart crop) |
| Subtitles | ASS/SSA format con karaoke tags (\K) |
| Queue | Redis (Upstash serverless) + arq |
| Hosting | Vercel (frontend), Railway (processor), Upstash (Redis) |
| Testing | Vitest + Playwright (frontend), pytest (processing) |

---

## Module Map

| Module | Purpose | Phase |
|--------|---------|-------|
| Infrastructure | Monorepo setup, env config, Docker dev | Phase 0 |
| Auth | Supabase Auth (magic link, Google, Apple), user profiles, RLS | Phase 1 |
| Upload & Storage | Video upload, validation, Supabase Storage, progress tracking | Phase 2 |
| Processing Core | Audio extraction, CrisperWhisper, silence detection, video cutting, job queue | Phase 3 |
| Dynamic Subtitles | ASS generation, karaoke animation, customization, multi-lingua, burn-in | Phase 4 |
| Advanced Processing | Speed control, filler removal, format/crop, smart crop, safe zones | Phase 5 |
| Preview & Download | In-browser preview, multi-resolution download, progress UI, email | Phase 6 |
| Monetization | Stripe subscriptions, free/pro tier enforcement, Customer Portal | Phase 7 |
| Polish & Launch | Landing page, onboarding, error handling, performance, GDPR, monitoring | Phase 8 |

---

## Tier & Limiti

| | Free | Pro (€10/mese o €100/anno) |
|---|---|---|
| Durata input | Max 60 secondi | Max 3 minuti |
| Risoluzione output | Max 1080p | Max 4K |
| Watermark | No | No |
| Tutte le feature | Sì | Sì |
| Processing priority | Normale | Alta (Redis priority queue) |

**Lingue sottotitoli:** IT, EN, ES, FR, DE, PT

---

## Key Invariants (MAI violare)

1. **Video originale MAI modificato** — sempre creare un nuovo file processato
2. **Free tier: max 60s input, max 1080p output** — enforced sia frontend che backend
3. **Pro tier: max 3min input, max 4K output** — verificare subscription attiva prima del processing
4. **Job processing è idempotent** — se fallisce e riprova, produce lo stesso risultato
5. **Cleanup obbligatorio** — file temporanei cancellati dopo processing, video processati dopo 30 giorni
6. **Auth required per qualsiasi upload/processing** — nessuna operazione anonima
7. **Stripe è source of truth per lo stato subscription** — sync via webhook, mai hardcoded
8. **Processing timeout: 5 minuti** — se il job non completa, fallisce con errore

---

## Piano Fasi (dettaglio)

### Fase 0 — Project Setup & Infrastructure ✅
> Monorepo funzionante con entrambi i servizi che si avviano in locale.

- Root npm workspaces monorepo (`apps/web/`, `apps/processor/`)
- Next.js 16 con App Router, TypeScript, Tailwind v4, shadcn/ui
- Python FastAPI service con pydantic-settings, health endpoint, API key auth
- Docker Compose: Redis + processor
- Supabase SDK (client, server, middleware)
- Testing: Vitest (frontend) + pytest (Python)
- DB migration: profiles, videos, jobs, subscription_events con RLS
- Linting: ESLint + Prettier (frontend), Ruff (Python)

**Completata:** 2026-03-17
**Piano dettagliato:** `tasks/plans/phase-0-setup.md`

---

### Fase 1 — Authentication & User Management ✅
> Login completo con magic link, Google e Apple. Utenti persistiti in Supabase.

**Completata:** 2026-03-17
**Documentazione:** `docs/auth.md`

**Deliverables:**
- Supabase Auth providers configurati (magic link, Google, Apple)
- Pagine: login, signup, callback, profilo utente
- Auth flow con `@supabase/ssr` + middleware route protette
- RLS policies attive su tutte le tabelle
- Gestione sessione (refresh token, logout)

**Verifiche:**
- Login/logout con magic link funziona
- Login con Google OAuth funziona
- Route protette redirigono a login
- RLS impedisce accesso cross-user

---

### Fase 2 — Video Upload & Storage
> L'utente può caricare un video, validarlo, e vederlo nella dashboard.

**Deliverables:**
- UI upload: drag & drop + click, progress bar
- Validazione client-side e server-side (formato, dimensione, durata per tier)
- Upload diretto a Supabase Storage via signed URL (bypass Vercel timeout 60s)
- Record `videos` in DB con metadata
- Dashboard "I miei video" con lista e player

**Verifiche:**
- Upload video < 60s funziona (free tier)
- Upload video > 60s bloccato per free
- Video appare in dashboard
- Isolamento utenti (A non vede B)

---

### Fase 3 — Video Processing Pipeline (Core)
> Un video caricato viene processato: silenzi rimossi, trascrizione word-level.

**Deliverables:**
- arq worker con connessione Redis (Upstash)
- Pipeline: download → audio extraction (FFmpeg → WAV 16kHz) → Silero VAD → CrisperWhisper → pause detection → taglio silenzi (FFmpeg + crossfade 50ms) → upload risultato
- Next.js API route → crea job in DB + push a Redis
- Status tracking via Supabase Realtime
- Error handling, retry (max 3), timeout (5 min)

**Verifiche:**
- Video con pause processato, silenzi rimossi
- Job status transitions corrette
- Retry su failure transiente
- Timeout dopo 5 minuti

---

### Fase 4 — Dynamic Subtitles
> Sottotitoli animati word-by-word con personalizzazione completa.

**Deliverables:**
- Generazione ASS/SSA da word-level timestamps (karaoke tags \K)
- Raggruppamento parole (max 5/riga su 9:16, max 8 su 16:9)
- Animazione highlight: parola corrente cambia colore
- Burn-in con FFmpeg (`ass` filter)
- UI personalizzazione: font, colore base + highlight, dimensione, posizione, bordo/ombra
- Multi-lingua (IT, EN, ES, FR, DE, PT) con auto-detect
- Preview sottotitoli

**Verifiche:**
- Sottotitoli corretti IT e EN
- Personalizzazione applicata al render
- Auto-detect lingua funziona

---

### Fase 5 — Advanced Processing Features
> Speed control, filler removal, smart crop, platform safe zones.

**Deliverables:**
- **Speed control:** uniforme (0.5x–2x) + smart (accelera solo non-parlato)
- **Filler removal:** detection CrisperWhisper + dizionari per-lingua, taglio con crossfade, toggle on/off
- **Format/Crop:** preset 9:16/16:9/1:1/4:3, smart crop MediaPipe, EMA smoothing, fallback center crop
- **Safe zones:** TikTok, IG Reels, YT Shorts overlay, sottotitoli auto-posizionati

**Verifiche:**
- Speed 2x produce durata corretta
- Filler words rimossi in video italiano
- Smart crop segue il volto
- Sottotitoli dentro safe zone per ogni piattaforma

---

### Fase 6 — Preview & Download
> L'utente può vedere l'anteprima del video processato e scaricarlo.

**Deliverables:**
- Player video in-browser
- Confronto before/after (split view o toggle)
- Download con scelta risoluzione (720p, 1080p, 4K pro)
- Progress bar con percentuale
- Notifica email quando pronto (opt-in)
- Pagina storico video processati
- Cleanup automatico dopo 30 giorni

**Verifiche:**
- Preview funziona
- Download produce file valido
- Risoluzione rispetta limiti tier
- Cleanup cancella video vecchi

---

### Fase 7 — Stripe Integration & Monetization
> Pagamenti funzionanti, free/pro tier enforced end-to-end.

**Deliverables:**
- Prodotti e prezzi Stripe (mensile €10, annuale €100)
- Stripe Checkout per upgrade a Pro
- Stripe Customer Portal per gestione abbonamento
- Webhook handler (subscription created/updated/deleted/payment_failed)
- Sync stato subscription → Supabase DB
- Enforcement limiti: frontend (UI + CTA), API (validazione), processing (verifica tier)
- Pagina pricing
- Gestione downgrade (pro → free)

**Verifiche:**
- Checkout flow completo (test mode)
- Webhook aggiorna stato correttamente
- Free user bloccato su > 60s
- Pro user processa fino a 3 min

---

### Fase 8 — Polish & Launch
> Prodotto pronto per il lancio pubblico.

**Deliverables:**
- Landing page (hero, feature showcase, pricing, CTA)
- SEO (meta tags, OG images, sitemap, robots.txt)
- Onboarding flow nuovi utenti
- Error boundaries + fallback UI + loading states + skeletons
- Rate limiting API
- GDPR (privacy policy, cookie banner, data deletion)
- Monitoring (Sentry, Plausible/Posthog)
- Performance (Lighthouse > 90)
- Responsive design (mobile, tablet, desktop)
- Deploy produzione: Vercel + Railway
- DNS e dominio custom

**Verifiche:**
- E2E Playwright: signup → upload → process → download
- Lighthouse > 90
- Mobile responsive

---

## Hosting & Infra

| Servizio | Provider | Config |
|----------|----------|--------|
| Frontend | Vercel | Auto-deploy da `main`, root: `apps/web/` |
| Processor | Railway | Auto-deploy da `main`, root: `apps/processor/` |
| DB + Auth + Storage | Supabase Cloud | Project ref: `agamdakjptqwcjebeuye` |
| Redis | Upstash | Serverless |
| Payments | Stripe | Test mode fino a Fase 8 |

**Branch strategy:** `main` (production), `feature/*` (feature branches)

---

## Known Gotchas

- FFmpeg deve essere nel container Railway (`apt-get install ffmpeg`)
- CrisperWhisper: ~2GB VRAM per `large-v3` o ~4GB RAM CPU-only → Railway min 4GB RAM
- Supabase Storage: 50MB/file su piano gratuito → upload chunked per video grandi
- Vercel timeout 60s sulle API routes → upload diretto a Supabase Storage
- Upstash Redis: limiti connessioni concorrenti su piano gratuito
- ASS rendering varia tra versioni libass → testare sulla build FFmpeg di produzione
- Sottotitoli con molte parole → max 5 parole/riga su formato verticale
- Storage buckets non creabili via SQL → creare da Dashboard Supabase
- `supabase link` richiede TTY login (o env var `SUPABASE_ACCESS_TOKEN`)
- Tailwind v4 usa config CSS-based, non `tailwind.config.ts`
- Next.js 16 depreca `middleware.ts` in favore di `proxy`

---

## Riferimenti

| Documento | Path |
|-----------|------|
| Todo/Checklist fasi | `tasks/todo.md` |
| Lessons learned | `tasks/lessons.md` |
| Piani dettagliati fasi | `tasks/plans/phase-*.md` |
| Architettura | `docs/architecture.md` |
| Pipeline processing | `docs/processing-pipeline.md` |
| Schema database | `docs/database-schema.md` |
| Specifiche API | `docs/api-spec.md` |
| Istruzioni Claude | `CLAUDE.md` |
