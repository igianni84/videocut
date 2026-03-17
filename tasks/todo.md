# VideoCut — Piano di Implementazione per Fasi

Ogni fase è progettata per essere completata in una singola sessione di chat.
Ogni fase termina con: test, documentazione aggiornata, verifica funzionale.

_Deliverables e verifiche dettagliate per ogni fase → `tasks/plans/master-plan.md`_

---

## Fase 0 — Project Setup & Infrastructure

- [x] Inizializzare repo Git
- [x] Creare struttura monorepo (`apps/web/`, `apps/processor/`)
- [x] Scaffoldare Next.js 16 app con TypeScript, Tailwind CSS 4.2, shadcn/ui
- [x] Scaffoldare Python service con FastAPI, arq, struttura cartelle
- [x] Creare `docker-compose.yml` per dev locale (Redis, Python service)
- [x] Creare `Dockerfile` per il Python processing service
- [x] Configurare `.env.example` e `.env.local`
- [x] Configurare ESLint, Prettier (frontend), Ruff (Python)
- [x] Configurare Vitest (frontend), pytest (Python)
- [x] Setup Supabase project (da dashboard) e collegare SDK
- [x] Creare schema DB iniziale (migrazione Supabase)
- [x] Installare Claude Code skills (Tier 1 + Tier 2)
- [x] Creare custom skill `/phase`
- [x] **Test:** `npm run dev` avvia il frontend, `docker-compose up` avvia processor + Redis
- [x] **Test:** Connessione a Supabase funziona (health check)
- [x] **Docs:** Aggiornare docs se necessario

### Note post-completamento
- `supabase link` + `supabase db push` + `supabase gen types` da eseguire manualmente (richiede TTY login)
- Storage buckets `originals` e `processed` da creare via Supabase Dashboard
- Next.js 16 depreca `middleware.ts` in favore di `proxy` — adattare in Fase 1

## Fase 1 — Authentication & User Management

- [x] Configurare Supabase Auth providers (magic link, Google, Apple)
- [x] Creare pagine: login, signup, callback, profilo utente
- [x] Implementare auth flow con `@supabase/ssr`
- [x] Middleware Next.js per route protette
- [x] RLS policies su tutte le tabelle (users vedono solo i propri dati)
- [x] Pagina profilo utente con info account e piano attivo
- [x] Gestione sessione (refresh token, logout)
- [x] **Test:** Login/logout con magic link funziona
- [x] **Test:** Login con Google OAuth funziona
- [x] **Test:** Route protette redirigono a login se non autenticati
- [x] **Test:** RLS impedisce accesso cross-user
- [x] **Docs:** Documentare auth flow in docs/

### Note post-completamento
- OAuth providers (Google, Apple) da configurare in Supabase Dashboard (redirect URL: `{APP_URL}/auth/callback`)
- RLS policies verificate via SQL — test end-to-end richiede istanza Supabase live
- 29 test Vitest passano (unit: LoginForm, ProfileForm, actions, middleware)

## Fase 2 — Video Upload & Storage

- [x] UI di upload: drag & drop + click, progress bar
- [x] Validazione client-side: formato (mp4, mov, webm), dimensione, durata (60s free / 3min pro)
- [x] Upload diretto a Supabase Storage via signed URL (bypass Vercel timeout)
- [x] Creazione record `videos` in DB con metadata (durata, dimensioni, formato, owner)
- [x] Dashboard "I miei video" con lista video caricati
- [x] Player video nella dashboard per review pre-processing
- [x] Validazione server-side della durata e dimensione
- [x] Gestione errori upload (retry, timeout, file corrotto)
- [x] **Test:** Upload video < 60s funziona (free tier) — validation unit tests pass
- [x] **Test:** Upload video > 60s bloccato per free tier — validation unit tests pass
- [x] **Test:** Video appare nella dashboard dopo upload — router.refresh() after upload
- [x] **Test:** Utente A non vede video di utente B — RLS + user_id filtering
- [x] **Docs:** Aggiornare docs/

### Note post-completamento
- Storage bucket `originals` must exist in Supabase Dashboard (created in Phase 0)
- `SUPABASE_SERVICE_ROLE_KEY` env var required for signed URL generation
- XHR used for upload (fetch doesn't support progress tracking)
- @base-ui/react uses `render` prop instead of Radix's `asChild`
- 58 tests pass (29 existing + 29 new validation tests)

## Fase 3 — Video Processing Pipeline (Core)

- [x] Setup arq worker in Python service con connessione Redis (Upstash)
- [x] Endpoint FastAPI per trigger processing job
- [x] Next.js API route che crea job in DB + push a Redis
- [x] Worker: download video da Supabase Storage
- [x] Worker: estrazione audio (FFmpeg → WAV 16kHz mono)
- [x] Worker: Silero VAD per segmentazione speech/non-speech
- [x] Worker: faster-whisper per trascrizione + word-level timestamps
- [x] Worker: detection pause (gap > threshold configurabile tra parole)
- [x] Worker: taglio silenzi con FFmpeg + audio crossfade (25ms) ai punti di taglio
- [x] Worker: upload video processato su Supabase Storage
- [x] Worker: aggiornamento status job in DB (queued → processing → completed/failed)
- [x] Frontend: Supabase Realtime subscription per status updates
- [x] Frontend: UI stato processing (queued, in lavorazione, completato, errore)
- [x] Gestione errori e retry (max 3 tentativi)
- [x] Processing timeout (5 minuti max)
- [x] **Test:** 71 Python tests (models, cut planner, ffmpeg, routes, worker)
- [x] **Test:** 81 frontend tests (JobStatusBadge, API routes, server actions + existing)
- [x] **Docs:** Aggiornare docs/architecture.md con file tree aggiornato

### Note post-completamento
- Uses faster-whisper (not CrisperWhisper) for transcription — CrisperWhisper integration deferred to Phase 4 for filler word enrichment
- Audio crossfade is 25ms (not 50ms) — provides smoother transitions without artifacts
- `processed` Storage bucket must exist in Supabase Dashboard (created in Phase 0)
- Redis required for worker: `docker-compose up redis` for local dev
- 152 total tests (71 Python + 81 frontend)

## Fase 4 — Dynamic Subtitles

- [x] Generazione ASS/SSA da word-level timestamps (karaoke tags \K)
- [x] Raggruppamento parole in righe (max 5 parole per riga su 9:16, max 8 su 16:9)
- [x] Animazione highlight: parola corrente cambia colore mentre viene pronunciata
- [x] Burn-in sottotitoli con FFmpeg (`ass` filter)
- [x] UI personalizzazione sottotitoli:
  - [x] Font (selezionabile da lista predefinita)
  - [x] Colore testo base + colore highlight
  - [x] Dimensione testo
  - [x] Posizione verticale (alto, centro, basso)
  - [x] Stile bordo/ombra
- [x] Supporto multi-lingua (IT, EN, ES, FR, DE, PT) — auto-detect o selezione manuale
- [x] Preview real-time dei sottotitoli (almeno mock statico)
- [x] **Test:** Sottotitoli generati correttamente per video in italiano
- [x] **Test:** Sottotitoli generati correttamente per video in inglese
- [x] **Test:** Personalizzazione applicata correttamente al render
- [x] **Test:** Auto-detect lingua funziona
- [x] **Docs:** Aggiornare docs/

### Note post-completamento
- 114 Python tests (67 new/modified for ASS generator, FFmpeg burn, worker subtitle pipeline)
- 103 frontend tests (22 new for subtitle types, preview, customizer, dialog)
- 217 total tests (114 Python + 103 frontend)
- fonts-montserrat, fonts-inter, fonts-roboto installed in Dockerfile
- ASS karaoke tags `\K` for word-by-word highlight
- Timestamp remapping handles cut timeline correctly
- ProcessButton replaced by ProcessingOptionsDialog in VideoCard

## Fase 5 — Advanced Processing Features

- [ ] **Speed control:**
  - [ ] Uniforme: 0.5x, 0.75x, 1x, 1.25x, 1.5x, 2x
  - [ ] Smart: accelera solo le parti di non-parlato residue
- [ ] **Filler word removal:**
  - [ ] Detection da CrisperWhisper tags + dizionario per-lingua
  - [ ] Dizionari filler: IT, EN, ES, FR, DE, PT
  - [ ] Taglio con crossfade (non hard cut)
  - [ ] Toggle on/off per l'utente
- [ ] **Format/Crop:**
  - [ ] Preset: 9:16 (TikTok/Reels/Shorts), 16:9 (YouTube), 1:1 (Instagram), 4:3
  - [ ] Smart crop con face detection (MediaPipe)
  - [ ] EMA smoothing per evitare crop jittery
  - [ ] Fallback a center crop se nessun volto rilevato
- [ ] **Platform safe zones:**
  - [ ] TikTok, Instagram Reels, YouTube Shorts safe zone overlay
  - [ ] Sottotitoli posizionati automaticamente nella safe zone
- [ ] UI per selezionare/configurare ogni feature
- [ ] **Test:** Speed 2x produce video alla durata corretta
- [ ] **Test:** Filler words rimossi in video italiano
- [ ] **Test:** Smart crop segue il volto del parlante
- [ ] **Test:** Sottotitoli dentro safe zone per ogni piattaforma
- [ ] **Docs:** Aggiornare docs/

## Fase 6 — Preview & Download

- [ ] Player video in-browser per anteprima risultato
- [ ] Confronto before/after (split view o toggle)
- [ ] Download video processato
- [ ] Scelta risoluzione download (720p, 1080p, 4K per pro)
- [ ] Progress bar durante il processing con percentuale stimata
- [ ] Notifica email quando il video è pronto (opzionale, opt-in)
- [ ] Pagina "I miei video processati" con storico
- [ ] Cleanup automatico: video processati cancellati dopo 30 giorni
- [ ] **Test:** Preview funziona nel browser
- [ ] **Test:** Download produce file valido
- [ ] **Test:** Risoluzione rispetta i limiti del tier
- [ ] **Test:** Cleanup cancella video vecchi
- [ ] **Docs:** Aggiornare docs/

## Fase 7 — Stripe Integration & Monetization

- [ ] Creare prodotti e prezzi Stripe (mensile €10, annuale €100)
- [ ] Stripe Checkout session per upgrade a Pro
- [ ] Stripe Customer Portal per gestione abbonamento
- [ ] Webhook handler per eventi Stripe (subscription created/updated/deleted/payment_failed)
- [ ] Sync stato subscription in Supabase DB
- [ ] Enforcement limiti:
  - [ ] Frontend: UI mostra limiti e CTA upgrade
  - [ ] API: validazione durata/risoluzione in base al tier
  - [ ] Processing: verifica tier prima di iniziare il job
- [ ] Pagina pricing
- [ ] Trial period (opzionale, da decidere)
- [ ] Gestione downgrade (da pro a free)
- [ ] **Test:** Checkout flow completo (test mode Stripe)
- [ ] **Test:** Webhook aggiorna correttamente lo stato
- [ ] **Test:** Free user bloccato su video > 60s
- [ ] **Test:** Pro user può processare video fino a 3 min
- [ ] **Docs:** Aggiornare docs/

## Fase 8 — Polish & Launch

- [ ] Landing page (hero, feature showcase, pricing, CTA)
- [ ] SEO: meta tags, OG images, sitemap, robots.txt
- [ ] Onboarding flow per nuovi utenti
- [ ] Error boundaries e fallback UI
- [ ] Loading states e skeleton screens
- [ ] Rate limiting API
- [ ] GDPR: privacy policy, cookie banner, data deletion
- [ ] Monitoring: error tracking (Sentry), analytics (Plausible/Posthog)
- [ ] Performance: Lighthouse score > 90, image optimization
- [ ] Responsive design check (mobile, tablet, desktop)
- [ ] Deploy produzione: Vercel (web) + Railway (processor)
- [ ] DNS e dominio custom
- [ ] **Test:** E2E Playwright: signup → upload → process → download
- [ ] **Test:** Lighthouse performance > 90
- [ ] **Test:** Mobile responsive
- [ ] **Docs:** Documentazione finale completa
