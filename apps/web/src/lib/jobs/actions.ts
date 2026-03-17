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
