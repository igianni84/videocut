"use server"

import { createClient } from "@/lib/supabase/server"
import type { Job } from "./types"

export async function getJobs(): Promise<Job[]> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) return []

  const { data } = await supabase
    .from("jobs")
    .select("*")
    .eq("user_id", user.id)
    .order("created_at", { ascending: false })

  return data ?? []
}

export async function getCompletedJobsWithVideos() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) return []

  const { data } = await supabase
    .from("jobs")
    .select("*, videos(original_filename, storage_path, duration_seconds)")
    .eq("user_id", user.id)
    .eq("status", "completed")
    .not("output_storage_path", "is", null)
    .order("completed_at", { ascending: false })

  return data ?? []
}

export async function getJobsForVideo(videoId: string): Promise<Job[]> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) return []

  const { data } = await supabase
    .from("jobs")
    .select("*")
    .eq("video_id", videoId)
    .eq("user_id", user.id)
    .order("created_at", { ascending: false })

  return data ?? []
}
