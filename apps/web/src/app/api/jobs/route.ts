import { NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { createAdminClient } from "@/lib/supabase/admin"
import { validateDuration, DURATION_LIMITS } from "@/lib/videos/validation"
import type { Tier } from "@/lib/videos/types"
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
    .select("id, storage_path, status, duration_seconds")
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

  // Tier enforcement
  const { data: profile } = await supabase
    .from("profiles")
    .select("tier, subscription_status")
    .eq("id", user.id)
    .single()

  // Defense-in-depth: if tier=pro but subscription not active/trialing, treat as free
  let effectiveTier: Tier = (profile?.tier as Tier) ?? "free"
  if (
    effectiveTier === "pro" &&
    profile?.subscription_status !== "active" &&
    profile?.subscription_status !== "trialing"
  ) {
    effectiveTier = "free"
  }

  // Validate duration against tier limits
  const durationError = validateDuration(video.duration_seconds, effectiveTier)
  if (durationError) {
    return NextResponse.json({ error: durationError }, { status: 403 })
  }

  // Block 4K for free tier
  const requestedResolution = body.options?.output_resolution
  if (effectiveTier === "free" && requestedResolution === "4k") {
    return NextResponse.json(
      { error: `4K resolution is only available on the Pro plan. Upgrade at /pricing` },
      { status: 403 },
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

  // Use admin client for internal status updates (bypasses RLS)
  const admin = createAdminClient()

  // Update video status to processing
  await admin
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
      await admin
        .from("jobs")
        .update({ status: "failed", error_message: `Processing service error: ${detail}` })
        .eq("id", job.id)
      await admin
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
    await admin
      .from("jobs")
      .update({ status: "failed", error_message: "Processing service unreachable" })
      .eq("id", job.id)
    await admin
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
