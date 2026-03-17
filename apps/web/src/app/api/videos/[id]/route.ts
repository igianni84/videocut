import { NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"

export async function DELETE(
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

  // Fetch video to get storage path (RLS ensures ownership)
  const { data: video, error: fetchError } = await supabase
    .from("videos")
    .select("storage_path")
    .eq("id", id)
    .single()

  if (fetchError || !video) {
    return NextResponse.json({ error: "Video not found" }, { status: 404 })
  }

  // Delete from storage
  const { error: storageError } = await supabase.storage
    .from("originals")
    .remove([video.storage_path])

  if (storageError) {
    console.error("Failed to delete from storage:", storageError.message)
  }

  // Delete from DB
  const { error: dbError } = await supabase
    .from("videos")
    .delete()
    .eq("id", id)

  if (dbError) {
    return NextResponse.json({ error: dbError.message }, { status: 500 })
  }

  return new NextResponse(null, { status: 204 })
}
