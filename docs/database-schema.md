# VideoCut — Schema Database (Supabase / PostgreSQL)

> **SQL source of truth:** `supabase/migrations/20260317000000_initial_schema.sql` + `supabase/migrations/20260318000000_phase6_preview_download.sql`
> In caso di conflitto tra questo documento e il file migration, il file migration vince.

## Tabelle

### profiles

Collegata a `auth.users` (gestita da Supabase Auth). Creata automaticamente al signup tramite trigger `on_auth_user_created`.

| Colonna | Tipo | Note |
|---------|------|------|
| id | UUID PK | FK → auth.users(id), CASCADE |
| email | TEXT NOT NULL | |
| full_name | TEXT | Da user metadata |
| avatar_url | TEXT | Da user metadata |
| tier | TEXT | `'free'` (default) o `'pro'` |
| stripe_customer_id | TEXT UNIQUE | |
| stripe_subscription_id | TEXT UNIQUE | |
| subscription_status | TEXT | `none`, `active`, `past_due`, `canceled`, `trialing` |
| subscription_period_end | TIMESTAMPTZ | |
| preferred_language | TEXT | Default: `'auto'` |
| email_notifications | BOOLEAN | Default: `false`. Opt-in email when video ready |
| created_at / updated_at | TIMESTAMPTZ | Auto-managed |

**RLS:** Users can SELECT/UPDATE only own profile.

### videos

| Colonna | Tipo | Note |
|---------|------|------|
| id | UUID PK | Auto-generated |
| user_id | UUID NOT NULL | FK → profiles(id), CASCADE |
| original_filename | TEXT NOT NULL | |
| storage_path | TEXT NOT NULL | Path in Supabase Storage |
| mime_type | TEXT NOT NULL | |
| file_size_bytes | BIGINT NOT NULL | |
| duration_seconds | NUMERIC(8,2) NOT NULL | |
| width / height | INTEGER | |
| status | TEXT | `uploaded`, `processing`, `completed`, `failed` |
| created_at / updated_at | TIMESTAMPTZ | Auto-managed |

**Indici:** user_id, status
**RLS:** Users can SELECT/INSERT/DELETE own videos. Service role: full access.

### jobs

| Colonna | Tipo | Note |
|---------|------|------|
| id | UUID PK | Auto-generated |
| user_id | UUID NOT NULL | FK → profiles(id), CASCADE |
| video_id | UUID NOT NULL | FK → videos(id), CASCADE |
| status | TEXT | `queued`, `processing`, `completed`, `failed` |
| progress | INTEGER | 0-100 |
| error_message | TEXT | |
| retry_count | INTEGER | Default: 0 |
| options | JSONB | Processing options (flessibilita futura) |
| output_storage_path | TEXT | Path video processato |
| output_duration_seconds | NUMERIC(8,2) | |
| output_width / output_height | INTEGER | |
| transcription | JSONB | Word-level timestamps completi |
| queued_at | TIMESTAMPTZ | Default: now() |
| started_at / completed_at | TIMESTAMPTZ | |
| processing_duration_ms | INTEGER | |
| created_at / updated_at | TIMESTAMPTZ | Auto-managed |

**Indici:** user_id, video_id, status, completed_at (for cleanup queries)
**RLS:** Users can SELECT/INSERT own jobs. Service role: full access.

### subscription_events (audit trail Stripe)

| Colonna | Tipo | Note |
|---------|------|------|
| id | UUID PK | Auto-generated |
| user_id | UUID | FK → profiles(id), SET NULL on delete |
| stripe_event_id | TEXT NOT NULL UNIQUE | |
| event_type | TEXT NOT NULL | |
| payload | JSONB NOT NULL | |
| processed_at | TIMESTAMPTZ | |

**RLS:** Solo service role.

## Rationale RLS

Ogni tabella ha RLS abilitato. Pattern:
- **User tables (profiles, videos, jobs):** `auth.uid() = user_id` per SELECT/INSERT/UPDATE/DELETE
- **Service-only (subscription_events):** solo `auth.role() = 'service_role'`
- **Service role bypass:** Il processing service usa service_role key per accesso completo a videos/jobs

## Supabase Storage Buckets

Configurati da Supabase Dashboard (non creabili via SQL):

| Bucket | Public | Size Limit | MIME Types | Uso |
|--------|--------|------------|------------|-----|
| `originals` | No | 500MB | video/mp4, video/quicktime, video/webm | Upload utente |
| `processed` | No | 1GB | video/mp4 | Output processing |

**Storage RLS:** Users can upload/read nella propria folder (`auth.uid()::text = foldername[1]`). Service role: full access.

## Supabase Realtime

Tabella `jobs` abilitata per Realtime (colonne `status` e `progress`).

Esempio frontend subscription:
```typescript
supabase
  .channel('job-updates')
  .on('postgres_changes', {
    event: 'UPDATE',
    schema: 'public',
    table: 'jobs',
    filter: `id=eq.${jobId}`
  }, (payload) => {
    // Aggiorna UI con nuovo status/progress
  })
  .subscribe()
```

## Updated_at Trigger

Tutte le tabelle con `updated_at` hanno un trigger automatico che aggiorna il campo su ogni UPDATE.
