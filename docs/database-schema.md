# VideoCut — Schema Database (Supabase / PostgreSQL)

## Tabelle

### users (gestita da Supabase Auth)
Supabase Auth crea automaticamente `auth.users`. Creiamo una tabella `public.profiles` collegata.

```sql
CREATE TABLE public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email TEXT NOT NULL,
  full_name TEXT,
  avatar_url TEXT,
  tier TEXT NOT NULL DEFAULT 'free' CHECK (tier IN ('free', 'pro')),
  stripe_customer_id TEXT UNIQUE,
  stripe_subscription_id TEXT UNIQUE,
  subscription_status TEXT DEFAULT 'none' CHECK (subscription_status IN ('none', 'active', 'past_due', 'canceled', 'trialing')),
  subscription_period_end TIMESTAMPTZ,
  preferred_language TEXT DEFAULT 'auto',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- RLS
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can view own profile" ON public.profiles FOR SELECT USING (auth.uid() = id);
CREATE POLICY "Users can update own profile" ON public.profiles FOR UPDATE USING (auth.uid() = id);

-- Trigger per creare profile su signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.profiles (id, email, full_name, avatar_url)
  VALUES (
    NEW.id,
    NEW.email,
    NEW.raw_user_meta_data->>'full_name',
    NEW.raw_user_meta_data->>'avatar_url'
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();
```

### videos
```sql
CREATE TABLE public.videos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  original_filename TEXT NOT NULL,
  storage_path TEXT NOT NULL,          -- path in Supabase Storage
  mime_type TEXT NOT NULL,
  file_size_bytes BIGINT NOT NULL,
  duration_seconds NUMERIC(8,2) NOT NULL,
  width INTEGER,
  height INTEGER,
  status TEXT NOT NULL DEFAULT 'uploaded' CHECK (status IN ('uploaded', 'processing', 'completed', 'failed')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_videos_user_id ON public.videos(user_id);
CREATE INDEX idx_videos_status ON public.videos(status);

-- RLS
ALTER TABLE public.videos ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can view own videos" ON public.videos FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own videos" ON public.videos FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can delete own videos" ON public.videos FOR DELETE USING (auth.uid() = user_id);

-- Service role può fare tutto (per il processing service)
CREATE POLICY "Service role full access" ON public.videos FOR ALL USING (auth.role() = 'service_role');
```

### jobs
```sql
CREATE TABLE public.jobs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  video_id UUID NOT NULL REFERENCES public.videos(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'queued' CHECK (status IN ('queued', 'processing', 'completed', 'failed')),
  progress INTEGER DEFAULT 0 CHECK (progress BETWEEN 0 AND 100),
  error_message TEXT,
  retry_count INTEGER NOT NULL DEFAULT 0,

  -- Processing options (JSONB per flessibilità)
  options JSONB NOT NULL DEFAULT '{}',

  -- Output
  output_storage_path TEXT,            -- path video processato in Storage
  output_duration_seconds NUMERIC(8,2),
  output_width INTEGER,
  output_height INTEGER,

  -- Transcription data (per eventuale editing futuro)
  transcription JSONB,                 -- word-level timestamps completi

  -- Timing
  queued_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  processing_duration_ms INTEGER,

  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_jobs_user_id ON public.jobs(user_id);
CREATE INDEX idx_jobs_video_id ON public.jobs(video_id);
CREATE INDEX idx_jobs_status ON public.jobs(status);

-- RLS
ALTER TABLE public.jobs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can view own jobs" ON public.jobs FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own jobs" ON public.jobs FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Service role full access" ON public.jobs FOR ALL USING (auth.role() = 'service_role');
```

### subscription_events (audit trail per Stripe)
```sql
CREATE TABLE public.subscription_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  stripe_event_id TEXT NOT NULL UNIQUE,
  event_type TEXT NOT NULL,
  payload JSONB NOT NULL,
  processed_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_sub_events_user_id ON public.subscription_events(user_id);
CREATE INDEX idx_sub_events_type ON public.subscription_events(event_type);

-- RLS: solo service role
ALTER TABLE public.subscription_events ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Service role only" ON public.subscription_events FOR ALL USING (auth.role() = 'service_role');
```

## Supabase Storage Buckets

```sql
-- Bucket per video originali (upload utente)
-- Configurato da Supabase Dashboard:
-- Name: originals
-- Public: false
-- File size limit: 500MB
-- Allowed MIME: video/mp4, video/quicktime, video/webm

-- Bucket per video processati (output)
-- Name: processed
-- Public: false
-- File size limit: 1GB
-- Allowed MIME: video/mp4

-- Storage policies
CREATE POLICY "Users can upload to own folder"
  ON storage.objects FOR INSERT
  WITH CHECK (
    bucket_id = 'originals'
    AND auth.uid()::text = (storage.foldername(name))[1]
  );

CREATE POLICY "Users can read own originals"
  ON storage.objects FOR SELECT
  USING (
    bucket_id = 'originals'
    AND auth.uid()::text = (storage.foldername(name))[1]
  );

CREATE POLICY "Users can read own processed"
  ON storage.objects FOR SELECT
  USING (
    bucket_id = 'processed'
    AND auth.uid()::text = (storage.foldername(name))[1]
  );

-- Service role ha accesso completo (per il processing service)
CREATE POLICY "Service role full storage access originals"
  ON storage.objects FOR ALL
  USING (bucket_id = 'originals' AND auth.role() = 'service_role');

CREATE POLICY "Service role full storage access processed"
  ON storage.objects FOR ALL
  USING (bucket_id = 'processed' AND auth.role() = 'service_role');
```

## Supabase Realtime

Abilitare Realtime sulla tabella `jobs` per le colonne `status` e `progress`:

```sql
-- Da Supabase Dashboard > Database > Replication
-- Oppure:
ALTER PUBLICATION supabase_realtime ADD TABLE public.jobs;
```

Il frontend sottoscrive i cambiamenti:
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

```sql
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER set_updated_at BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER set_updated_at BEFORE UPDATE ON public.videos
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER set_updated_at BEFORE UPDATE ON public.jobs
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();
```
