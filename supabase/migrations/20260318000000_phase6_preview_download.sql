-- Phase 6: Preview & Download
-- Add email_notifications to profiles, index on jobs(completed_at) for cleanup

ALTER TABLE public.profiles
  ADD COLUMN email_notifications BOOLEAN NOT NULL DEFAULT false;

CREATE INDEX idx_jobs_completed_at ON public.jobs(completed_at);
