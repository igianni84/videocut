# VideoCut — Specifiche API

## Next.js API Routes (apps/web)

Tutte le route richiedono autenticazione via Supabase session cookie (eccetto webhooks).

### Upload

#### `POST /api/upload/signed-url`
Genera un signed URL per upload diretto a Supabase Storage.

**Request:**
```json
{
  "filename": "video.mp4",
  "contentType": "video/mp4",
  "fileSize": 15000000
}
```

**Response 200:**
```json
{
  "signedUrl": "https://xxx.supabase.co/storage/v1/...",
  "storagePath": "{userId}/{uuid}.mp4"
}
```

**Errori:**
- 401: Non autenticato
- 400: Tipo file non supportato
- 413: File troppo grande

---

### Videos

#### `POST /api/videos`
Registra un video caricato dopo upload completato.

**Request:**
```json
{
  "storagePath": "{userId}/{uuid}.mp4",
  "originalFilename": "il-mio-video.mp4",
  "mimeType": "video/mp4",
  "fileSize": 15000000,
  "durationSeconds": 45.5,
  "width": 1920,
  "height": 1080
}
```

**Response 201:**
```json
{
  "id": "uuid",
  "status": "uploaded",
  "createdAt": "2026-03-16T10:00:00Z"
}
```

**Errori:**
- 401: Non autenticato
- 400: Durata superiore al limite del tier
- 404: File non trovato in storage

#### `GET /api/videos`
Lista video dell'utente corrente.

**Response 200:**
```json
{
  "videos": [
    {
      "id": "uuid",
      "originalFilename": "video.mp4",
      "durationSeconds": 45.5,
      "status": "uploaded",
      "createdAt": "2026-03-16T10:00:00Z",
      "thumbnailUrl": "..."
    }
  ]
}
```

#### `DELETE /api/videos/{id}`
Elimina un video e tutti i job associati.

#### `GET /api/videos/{id}/download`
Genera un signed URL per scaricare il video processato.

**Response 200:**
```json
{
  "downloadUrl": "https://xxx.supabase.co/storage/v1/...",
  "filename": "my-video_processed.mp4"
}
```

**Errori:**
- 401: Non autenticato
- 404: Nessun video processato disponibile

#### `GET /api/videos/{id}/signed-url?bucket=originals|processed`
Genera un signed URL per riprodurre il video originale o processato nel browser.

**Response 200:**
```json
{
  "signedUrl": "https://xxx.supabase.co/storage/v1/..."
}
```

---

### Jobs

#### `POST /api/jobs`
Crea un job di processing per un video.

**Request:**
```json
{
  "videoId": "uuid",
  "options": {
    "silenceThresholdMs": 300,
    "removeFillers": true,
    "fillerLanguage": "auto",
    "speedMode": "none",
    "speedValue": 1.0,
    "subtitleEnabled": true,
    "subtitleFont": "Montserrat",
    "subtitleSize": 48,
    "subtitleColorBase": "#FFFFFF",
    "subtitleColorHighlight": "#FFFF00",
    "subtitlePosition": "bottom",
    "subtitleOutline": 2,
    "outputFormat": "9:16",
    "smartCrop": true,
    "targetPlatform": "tiktok",
    "outputResolution": "1080p"
  }
}
```

**Response 201:**
```json
{
  "id": "uuid",
  "status": "queued",
  "queuedAt": "2026-03-16T10:00:00Z"
}
```

**Errori:**
- 401: Non autenticato
- 400: Opzioni non valide
- 403: Risoluzione 4K richiesta ma tier free
- 404: Video non trovato
- 429: Troppi job in coda (max 3 concurrent per utente)

#### `GET /api/jobs/{id}`
Stato di un job specifico.

**Response 200:**
```json
{
  "id": "uuid",
  "videoId": "uuid",
  "status": "completed",
  "progress": 100,
  "outputUrl": "https://...",
  "outputDurationSeconds": 38.2,
  "processingDurationMs": 45000,
  "createdAt": "2026-03-16T10:00:00Z",
  "completedAt": "2026-03-16T10:00:45Z"
}
```

#### `GET /api/jobs`
Lista job dell'utente corrente.

---

### Notifications

#### `POST /api/notifications/job-complete`
Invia email di notifica quando un video è pronto. Autenticazione via `X-API-Key` header.

**Request:**
```json
{
  "jobId": "uuid",
  "userEmail": "user@example.com",
  "videoName": "my-video.mp4"
}
```

**Response 200:**
```json
{
  "success": true
}
```

---

### Cron

#### `GET /api/cron/cleanup`
Vercel Cron job che elimina video processati scaduti (>30 giorni). Eseguito giornalmente alle 3:00 UTC.

Autenticazione: header `Authorization: Bearer <CRON_SECRET>` (impostato da Vercel).

**Response 200:**
```json
{
  "cleaned": 5
}
```

---

### Billing

#### `POST /api/billing/checkout`
Crea una Stripe Checkout session per upgrade a Pro.

**Request:**
```json
{
  "priceId": "price_monthly_or_annual",
  "successUrl": "/dashboard?upgraded=true",
  "cancelUrl": "/pricing"
}
```

**Response 200:**
```json
{
  "checkoutUrl": "https://checkout.stripe.com/..."
}
```

#### `POST /api/billing/portal`
Crea una Stripe Customer Portal session per gestione abbonamento.

**Response 200:**
```json
{
  "portalUrl": "https://billing.stripe.com/..."
}
```

#### `GET /api/billing/status`
Stato abbonamento dell'utente corrente.

**Response 200:**
```json
{
  "tier": "pro",
  "status": "active",
  "periodEnd": "2026-04-16T10:00:00Z",
  "cancelAtPeriodEnd": false
}
```

---

### Webhooks

#### `POST /api/webhooks/stripe`
Riceve eventi da Stripe. Autenticazione via signature verification.

**Eventi gestiti:**
- `checkout.session.completed` → attiva subscription
- `customer.subscription.updated` → aggiorna stato
- `customer.subscription.deleted` → downgrade a free
- `invoice.payment_failed` → marca subscription come past_due

---

## Python Processing Service API (apps/processor)

### Health

#### `GET /health`
Health check.

**Response 200:**
```json
{
  "status": "ok",
  "redis": "connected",
  "models_loaded": true
}
```

### Jobs (chiamato internamente da Next.js API o da arq)

#### `POST /api/process`
Trigger processing di un job. Autenticazione via `PROCESSING_API_KEY` header.

**Request:**
```json
{
  "jobId": "uuid",
  "videoStoragePath": "{userId}/{uuid}.mp4",
  "options": { ... }
}
```

**Response 202:**
```json
{
  "accepted": true,
  "jobId": "uuid"
}
```

Nota: il processing avviene in background via arq worker. Il risultato viene scritto direttamente in Supabase DB.
