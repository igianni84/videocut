import { NextResponse } from "next/server"
import { createClient } from "@supabase/supabase-js"
import { createClient as createServerClient } from "@/lib/supabase/server"
import { validateFileType, validateFileSize, getExtensionFromMime } from "@/lib/videos/validation"
import type { Database } from "@/types/database.types"

export async function POST(request: Request) {
  // Authenticate via session cookie
  const supabase = await createServerClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 })
  }

  const body = await request.json()
  const { contentType, fileSize } = body as {
    contentType: string
    fileSize: number
  }

  // Validate file type
  const typeError = validateFileType(contentType)
  if (typeError) {
    return NextResponse.json({ error: typeError }, { status: 400 })
  }

  // Validate file size
  const sizeError = validateFileSize(fileSize)
  if (sizeError) {
    return NextResponse.json({ error: sizeError }, { status: 413 })
  }

  // Generate storage path: {userId}/{uuid}{ext}
  const ext = getExtensionFromMime(contentType)
  const fileId = crypto.randomUUID()
  const storagePath = `${user.id}/${fileId}${ext}`

  // Create signed upload URL using service role client
  const serviceClient = createClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )

  const { data, error } = await serviceClient.storage
    .from("originals")
    .createSignedUploadUrl(storagePath)

  if (error) {
    console.error("Failed to create signed URL:", error.message)
    return NextResponse.json(
      { error: "Failed to create upload URL" },
      { status: 500 }
    )
  }

  return NextResponse.json({
    signedUrl: data.signedUrl,
    storagePath,
  })
}
