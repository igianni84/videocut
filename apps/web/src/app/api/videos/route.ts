import { NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { validateDuration } from "@/lib/videos/validation"
import type { RegisterVideoPayload } from "@/lib/videos/types"
import type { Database } from "@/types/database.types"

export async function GET() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 })
  }

  const { data: videos, error } = await supabase
    .from("videos")
    .select("*")
    .eq("user_id", user.id)
    .order("created_at", { ascending: false })

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ videos })
}

export async function POST(request: Request) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 })
  }

  const body = (await request.json()) as RegisterVideoPayload

  // Fetch user tier for duration validation
  const { data: profile } = await supabase
    .from("profiles")
    .select("tier")
    .eq("id", user.id)
    .single()

  const tier = (profile?.tier ?? "free") as Database["public"]["Tables"]["profiles"]["Row"]["tier"]

  // Server-side duration validation
  const durationError = validateDuration(body.durationSeconds, tier)
  if (durationError) {
    return NextResponse.json({ error: durationError }, { status: 400 })
  }

  // Validate storage path belongs to user
  if (!body.storagePath.startsWith(`${user.id}/`)) {
    return NextResponse.json(
      { error: "Invalid storage path" },
      { status: 400 }
    )
  }

  // Insert video record
  const { data: video, error } = await supabase
    .from("videos")
    .insert({
      user_id: user.id,
      original_filename: body.originalFilename,
      storage_path: body.storagePath,
      mime_type: body.mimeType,
      file_size_bytes: body.fileSize,
      duration_seconds: body.durationSeconds,
      width: body.width,
      height: body.height,
      status: "uploaded",
    })
    .select("id, status, created_at")
    .single()

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json(
    {
      id: video.id,
      status: video.status,
      createdAt: video.created_at,
    },
    { status: 201 }
  )
}
