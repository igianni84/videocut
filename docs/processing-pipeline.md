# VideoCut — Pipeline di Video Processing

## Overview

La pipeline trasforma un video grezzo in un video editato con: silenzi rimossi, filler words rimossi, sottotitoli dinamici, speed control, smart crop.

## Pipeline Steps

```
Input Video (mp4/mov/webm)
    │
    ▼
[1] AUDIO EXTRACTION ──────────────────────────────────────
    FFmpeg: estrai audio come WAV 16kHz mono
    Comando: ffmpeg -i input.mp4 -ar 16000 -ac 1 -f wav audio.wav
    │
    ▼
[2] VOICE ACTIVITY DETECTION ──────────────────────────────
    Silero VAD (1.8MB model, <1ms per chunk)
    Input: audio.wav
    Output: lista segmenti [{start, end, is_speech}]
    Scopo: identificare regioni speech vs non-speech
    │
    ▼
[3] TRANSCRIPTION + WORD TIMESTAMPS ───────────────────────
    CrisperWhisper (modello large-v3)
    Input: solo segmenti speech (da step 2)
    Output: {
      language: "it",
      segments: [{
        text: "Ciao ehm oggi parliamo di...",
        words: [
          {word: "Ciao", start: 0.5, end: 0.8, is_filler: false},
          {word: "ehm", start: 0.9, end: 1.2, is_filler: true},
          {word: "oggi", start: 1.5, end: 1.7, is_filler: false},
          ...
        ]
      }]
    }
    │
    ▼
[4] FILLER WORD ENRICHMENT ────────────────────────────────
    Post-processing su output CrisperWhisper:
    - CrisperWhisper tagga automaticamente filler universali (um, uh, er)
    - Match aggiuntivo con dizionario per-lingua:
      IT: ehm, cioè, tipo, praticamente, diciamo, insomma, allora
      EN: um, uh, like, you know, I mean, basically, actually, so
      ES: eh, o sea, pues, bueno, este, digamos
      FR: euh, genre, bah, quoi, bon, ben, en fait
      DE: ahm, halt, also, sozusagen, quasi, irgendwie
      PT: tipo, né, então, assim, bom, quer dizer
    - Euristica: NON rimuovere filler se ha parole adiacenti entro 100ms
      (probabilmente intenzionale, non un riempitivo)
    │
    ▼
[5] SEGMENT ANALYSIS & CUT PLAN ──────────────────────────
    Input: word timestamps + VAD segments + filler tags + user options
    Calcola il "cut plan":
    - Pause > threshold (default 300ms): marcare per taglio
    - Filler words (se opzione attiva): marcare per taglio
    - Preserva minimo 50ms di pausa tra frasi (respiro naturale)
    Output: lista di segmenti da MANTENERE [{start, end}]
    │
    ▼
[6] VIDEO CUTTING ─────────────────────────────────────────
    FFmpeg: taglia e concatena i segmenti da mantenere
    - Audio crossfade di 25ms ad ogni punto di taglio
    - Usa concat demuxer per efficienza
    - Re-encode video (H.264) + audio (AAC)
    │
    ▼
[7] SPEED CONTROL (se richiesto) ──────────────────────────
    Due modalità:
    a) Uniforme: setpts=PTS/{speed}, atempo={speed}
       Supporto: 0.5x, 0.75x, 1x, 1.25x, 1.5x, 2x
    b) Smart: accelera solo le parti residue di non-parlato
       Identifica gap > 100ms, applica 2x solo a quelli
    Nota: aggiornare i timestamps dei sottotitoli dopo speed change!
    │
    ▼
[8] ASS SUBTITLE GENERATION ──────────────────────────────
    Genera file .ass con karaoke tags:

    Struttura ASS:
    [Script Info]
    ScriptType: v4.00+
    PlayResX: {video_width}
    PlayResY: {video_height}

    [V4+ Styles]
    Style: Default,{font},{size},&H00{highlight_color},&H00{base_color},
           &H00000000,&H80000000,{bold},{italic},0,0,100,100,0,0,
           1,{outline},{shadow},5,0,0,0,1

    [Events]
    Dialogue: 0,{start},{end},Default,,0,0,0,,{\K{dur1}}word1 {\K{dur2}}word2...

    Regole di raggruppamento:
    - Max 5 parole per riga su formato verticale (9:16)
    - Max 8 parole per riga su formato orizzontale (16:9)
    - Nuova riga quando gap tra parole > 1s
    - Posizionamento nella safe zone della piattaforma target

    Personalizzazione utente applicata:
    - Font family, size, bold/italic
    - Colore base (parole non ancora dette)
    - Colore highlight (parola corrente)
    - Outline/shadow per leggibilità
    - Posizione verticale (top/center/bottom)

    TIMESTAMP REMAPPING (dopo tagli):
    - Dopo il cut plan (step 6), i timestamps originali delle parole
      non corrispondono più alla timeline del video tagliato
    - Il remapping calcola il nuovo timestamp di ogni parola
      sottraendo la durata cumulativa dei segmenti rimossi
    - Esempio: parola a t=5.0s, se 1.2s di silenzi rimossi prima → t=3.8s
    - Il remapping è applicato PRIMA della generazione ASS
    │
    ▼
[9] SMART CROP (se cambio formato) ───────────────────────
    MediaPipe Face Detection:
    - Campiona ogni 5° frame (6 detections/sec a 30fps)
    - Rileva bounding box del volto principale
    - Calcola centro crop con EMA smoothing:
      crop_x = alpha * detected_x + (1-alpha) * prev_crop_x
      (alpha = 0.15 per movimento fluido)
    - Clamp coordinate per non uscire dal frame
    - Fallback: center crop se nessun volto per > 30 frame consecutivi

    Formati supportati:
    - 9:16 (TikTok, Reels, Shorts) — default
    - 16:9 (YouTube landscape)
    - 1:1 (Instagram post)
    - 4:3 (legacy)
    - Originale (nessun crop)
    │
    ▼
[10] SUBTITLE BURN-IN + FINAL ENCODE ─────────────────────
     FFmpeg filter chain completa:
     ffmpeg -i cut_video.mp4 \
       -vf "crop=...,ass=subtitles.ass" \
       -c:v libx264 -preset medium -crf 23 \
       -c:a aac -b:a 128k \
       -movflags +faststart \
       output.mp4

     Risoluzioni output:
     - 720p (1280x720 o 720x1280 per vertical)
     - 1080p (1920x1080 o 1080x1920 per vertical) — max free
     - 4K (3840x2160 o 2160x3840 per vertical) — solo pro
     │
     ▼
[11] UPLOAD & CLEANUP ────────────────────────────────────
     - Upload output su Supabase Storage
     - Aggiorna record job in DB: status=completed, output_url=...
     - Cancella TUTTI i file temporanei locali
     - Log processing time e metadata per analytics

Output: Video processato pronto per preview e download
```

## Parametri Configurabili (per job)

```python
class ProcessingOptions:
    # Silence removal
    silence_threshold_ms: int = 300       # Gap minimo per essere considerato pausa
    min_breath_pause_ms: int = 50         # Pausa minima preservata tra frasi

    # Filler removal
    remove_fillers: bool = True
    filler_language: str = "auto"         # auto-detect o lingua specifica

    # Speed
    speed_mode: str = "none"              # none, uniform, smart
    speed_value: float = 1.0              # Per uniform: 0.5-2.0

    # Subtitles
    subtitle_enabled: bool = True
    subtitle_font: str = "Montserrat"
    subtitle_size: int = 48
    subtitle_color_base: str = "#FFFFFF"
    subtitle_color_highlight: str = "#FFFF00"
    subtitle_position: str = "bottom"     # top, center, bottom
    subtitle_outline: int = 2
    subtitle_shadow: int = 1

    # Format
    output_format: str = "original"       # original, 9:16, 16:9, 1:1, 4:3
    smart_crop: bool = True               # Face detection per crop
    target_platform: str = "tiktok"       # tiktok, reels, shorts, youtube, none

    # Output
    output_resolution: str = "1080p"      # 720p, 1080p, 4k
```

## Platform Safe Zones

```
TikTok (9:16 = 1080x1920):
┌─────────────────────┐
│     TOP: 150px      │  ← username, follow
│  ┌───────────────┐  │
│  │               │  │
│  │   SAFE ZONE   │  │
│  │  980 x 1500   │  │
│  │               │  │
│  │  Subtitles    │  │
│  │  ideali a     │  │
│  │  y ≈ 1200     │  │
│  │               │  │
│  └───────────────┘  │
│   BOTTOM: 270px     │  ← caption, music
│                 R:100│  ← like, comment, share
└─────────────────────┘

Instagram Reels (9:16 = 1080x1920):
- Top: 210px, Bottom: 310px, Right: 100px
- Safe: 996 x 1400, centered

YouTube Shorts (9:16 = 1080x1920):
- Top: 150px, Bottom: 280px, Right: 100px
- Safe: 980 x 1490, centered

INTERSEZIONE UNIVERSALE (safe per tutte):
- Top: 210px, Bottom: 310px, Right: 100px
- Safe: 900 x 1400, centered
- Subtitles: y ≈ 1200 (60-65% dall'alto)
```

## Dipendenze Python

```
# Core
fastapi>=0.115.0
uvicorn>=0.34.0
arq>=0.26.0
redis>=5.2.0
pydantic>=2.10.0
pydantic-settings>=2.7.0

# Supabase
supabase>=2.12.0

# ASR / Audio
faster-crisperwhisper  # o faster-whisper come fallback
silero-vad
torch>=2.6.0

# Video / Image
ffmpeg-python>=0.2.0   # Solo per query, subprocess per operazioni
mediapipe>=0.10.0

# Testing
pytest>=8.3.0
pytest-asyncio>=0.24.0
```

## Gestione Errori

| Errore | Azione |
|--------|--------|
| Video corrotto / non decodificabile | Status `failed`, messaggio utente: "Video non valido" |
| CrisperWhisper timeout | Retry con modello più piccolo (medium) |
| Nessun speech rilevato | Status `completed`, ritorna video senza modifiche con avviso |
| FFmpeg crash | Retry 1x, poi `failed` con log errore |
| Storage upload fallito | Retry 3x con exponential backoff |
| Out of memory | Status `failed`, log per alerting, suggerire video più corto |
| Processing timeout (5min) | Kill job, status `failed`, cleanup file |

## Dynamic Subtitles Pipeline (Phase 4)

La generazione sottotitoli dinamici si inserisce nella pipeline principale tra il taglio video (step 6) e il burn-in finale (step 10).

### Flusso

```
Word-level timestamps (da step 3)
    │
    ▼
[A] TIMESTAMP REMAPPING ─────────────────────────────────
    Dopo i tagli (step 6), la timeline del video è cambiata.
    I timestamps originali delle parole vanno rimappati:
    - Per ogni segmento mantenuto dal cut plan, calcola l'offset cumulativo
    - Sottrai la durata dei gap rimossi da ogni timestamp
    - Le parole che cadono in segmenti rimossi vengono scartate
    Risultato: word timestamps allineati alla timeline del video tagliato
    │
    ▼
[B] ASS GENERATION ──────────────────────────────────────
    ass_generator.py produce il file .ass con:
    - Karaoke tags \K per highlight parola-per-parola
    - \K{durata_centisecondi} prima di ogni parola
    - La parola corrente cambia da colore base a colore highlight
    - Raggruppamento in righe (max 5 parole 9:16, max 8 parole 16:9)
    - Nuova riga quando gap tra parole > 1s
    - SubtitleStyle applicato: font, size, colors, position, outline, shadow
    │
    ▼
[C] FFMPEG BURN-IN ──────────────────────────────────────
    FFmpeg applica i sottotitoli al video tramite il filtro `ass`:
    ffmpeg -i cut_video.mp4 \
      -vf "ass=subtitles.ass" \
      -c:v libx264 -preset medium -crf 23 \
      -c:a aac -b:a 128k \
      -movflags +faststart \
      output.mp4

    Font embedding:
    - Montserrat, Inter, Roboto installati nel Dockerfile
    - FFmpeg risolve i font dal sistema durante il burn-in
```

### Dettagli Karaoke Tag \K

Il formato ASS usa `\K` (maiuscolo) per il karaoke "fill" mode:
- `{\K50}Hello` = la parola "Hello" si riempie del colore highlight in 500ms
- La durata in centisecondi corrisponde alla durata della parola (end - start)
- Il colore base (secondary color in ASS) e il colore highlight (primary color) sono configurabili dall'utente

### Timestamp Remapping — Esempio

```
Timeline originale:  [0.0 ─── 2.0] silenzio [2.5 ─── 5.0] silenzio [5.5 ─── 8.0]
Cut plan mantiene:   [0.0 ─── 2.0]          [2.5 ─── 5.0]          [5.5 ─── 8.0]
Timeline tagliata:   [0.0 ─── 2.0][2.0 ─── 4.5][4.5 ─── 7.0]

Parola "test" a t=5.8s originale:
- Gap rimossi prima: 0.5s (2.0→2.5) + 0.5s (5.0→5.5) = 1.0s
- Nuovo timestamp: 5.8 - 1.0 = 4.8s
```
