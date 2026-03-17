"use server"

import { createClient } from "@/lib/supabase/server"
import type { Video } from "./types"

export async function getVideos(): Promise<Video[]> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) return []

  const { data, error } = await supabase
    .from("videos")
    .select("*")
    .eq("user_id", user.id)
    .order("created_at", { ascending: false })

  if (error) {
    console.error("Failed to fetch videos:", error.message)
    return []
  }

  return data as Video[]
}

export async function deleteVideo(
  id: string
): Promise<{ success: boolean; error?: string }> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return { success: false, error: "Not authenticated" }
  }

  // Fetch video to get storage path (RLS ensures ownership)
  const { data: video, error: fetchError } = await supabase
    .from("videos")
    .select("storage_path")
    .eq("id", id)
    .single()

  if (fetchError || !video) {
    return { success: false, error: "Video not found" }
  }

  // Delete from storage
  const { error: storageError } = await supabase.storage
    .from("originals")
    .remove([video.storage_path])

  if (storageError) {
    console.error("Failed to delete from storage:", storageError.message)
    // Continue to delete DB record even if storage fails
  }

  // Delete from DB (RLS ensures ownership)
  const { error: dbError } = await supabase
    .from("videos")
    .delete()
    .eq("id", id)

  if (dbError) {
    return { success: false, error: dbError.message }
  }

  return { success: true }
}
