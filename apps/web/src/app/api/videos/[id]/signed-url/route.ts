import { NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"

export async function GET(
  request: Request,
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

  const url = new URL(request.url)
  const bucket = url.searchParams.get("bucket") ?? "originals"

  if (bucket !== "originals" && bucket !== "processed") {
    return NextResponse.json({ error: "Invalid bucket" }, { status: 400 })
  }

  // Get video storage path (RLS ensures ownership)
  const { data: video, error: fetchError } = await supabase
    .from("videos")
    .select("storage_path")
    .eq("id", id)
    .single()

  if (fetchError || !video) {
    return NextResponse.json({ error: "Video not found" }, { status: 404 })
  }

  const { data: signedData, error: signError } = await supabase.storage
    .from(bucket)
    .createSignedUrl(video.storage_path, 3600)

  if (signError || !signedData?.signedUrl) {
    return NextResponse.json(
      { error: "Failed to generate signed URL" },
      { status: 500 }
    )
  }

  return NextResponse.json({ signedUrl: signedData.signedUrl })
}
