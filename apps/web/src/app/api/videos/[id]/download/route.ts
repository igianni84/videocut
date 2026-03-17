import { NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 })
  }

  // Find latest completed job for this video with output_storage_path
  const { data: job, error: jobError } = await supabase
    .from("jobs")
    .select("output_storage_path")
    .eq("video_id", id)
    .eq("user_id", user.id)
    .eq("status", "completed")
    .not("output_storage_path", "is", null)
    .order("completed_at", { ascending: false })
    .limit(1)
    .single()

  if (jobError || !job?.output_storage_path) {
    return NextResponse.json(
      { error: "No processed video available" },
      { status: 404 }
    )
  }

  // Get original filename for download
  const { data: video } = await supabase
    .from("videos")
    .select("original_filename")
    .eq("id", id)
    .single()

  const originalName = video?.original_filename ?? "video"
  const baseName = originalName.replace(/\.[^.]+$/, "")

  // Generate signed URL (1 hour expiry)
  const { data: signedData, error: signError } = await supabase.storage
    .from("processed")
    .createSignedUrl(job.output_storage_path, 3600)

  if (signError || !signedData?.signedUrl) {
    return NextResponse.json(
      { error: "Failed to generate download URL" },
      { status: 500 }
    )
  }

  return NextResponse.json({
    downloadUrl: signedData.signedUrl,
    filename: `${baseName}_processed.mp4`,
  })
}
