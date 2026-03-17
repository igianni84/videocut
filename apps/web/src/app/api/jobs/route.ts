import { NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import type { CreateJobPayload } from "@/lib/jobs/types"

const PROCESSING_SERVICE_URL = process.env.PROCESSING_SERVICE_URL
const PROCESSING_API_KEY = process.env.PROCESSING_API_KEY
const MAX_CONCURRENT_JOBS = 3

export async function GET() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 })
  }

  const { data: jobs, error } = await supabase
    .from("jobs")
    .select("*")
    .eq("user_id", user.id)
    .order("created_at", { ascending: false })

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ jobs })
}

export async function POST(request: Request) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 })
  }

  const body = (await request.json()) as CreateJobPayload

  // Validate video exists and belongs to user
  const { data: video, error: videoError } = await supabase
    .from("videos")
    .select("id, storage_path, status")
    .eq("id", body.videoId)
    .eq("user_id", user.id)
    .single()

  if (videoError || !video) {
    return NextResponse.json({ error: "Video not found" }, { status: 404 })
  }

  if (video.status !== "uploaded" && video.status !== "completed") {
    return NextResponse.json(
      { error: "Video is already being processed" },
      { status: 409 },
    )
  }

  // Check concurrent job limit
  const { count } = await supabase
    .from("jobs")
    .select("id", { count: "exact", head: true })
    .eq("user_id", user.id)
    .in("status", ["queued", "processing"])

  if ((count ?? 0) >= MAX_CONCURRENT_JOBS) {
    return NextResponse.json(
      { error: `Maximum ${MAX_CONCURRENT_JOBS} concurrent jobs allowed` },
      { status: 429 },
    )
  }

  // Create job record
  const { data: job, error: jobError } = await supabase
    .from("jobs")
    .insert({
      user_id: user.id,
      video_id: body.videoId,
      status: "queued",
      options: body.options ?? {},
    })
    .select("id, status")
    .single()

  if (jobError) {
    return NextResponse.json({ error: jobError.message }, { status: 500 })
  }

  // Update video status to processing
  await supabase
    .from("videos")
    .update({ status: "processing" })
    .eq("id", body.videoId)

  // Call Python processing service
  try {
    const res = await fetch(`${PROCESSING_SERVICE_URL}/process`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-API-Key": PROCESSING_API_KEY ?? "",
      },
      body: JSON.stringify({
        job_id: job.id,
        video_storage_path: video.storage_path,
        options: body.options ?? {},
      }),
    })

    if (!res.ok) {
      const detail = await res.text()
      // Rollback: mark job as failed
      await supabase
        .from("jobs")
        .update({ status: "failed", error_message: `Processing service error: ${detail}` })
        .eq("id", job.id)
      await supabase
        .from("videos")
        .update({ status: "uploaded" })
        .eq("id", body.videoId)
      return NextResponse.json(
        { error: "Failed to start processing" },
        { status: 502 },
      )
    }
  } catch (err) {
    // Rollback on network error
    await supabase
      .from("jobs")
      .update({ status: "failed", error_message: "Processing service unreachable" })
      .eq("id", job.id)
    await supabase
      .from("videos")
      .update({ status: "uploaded" })
      .eq("id", body.videoId)
    return NextResponse.json(
      { error: "Processing service unavailable" },
      { status: 503 },
    )
  }

  return NextResponse.json(
    { id: job.id, status: job.status },
    { status: 201 },
  )
}
