import { NextResponse } from "next/server"
import { createClient as createServerClient } from "@/lib/supabase/server"
import { validateFileType, getExtensionFromMime, MAX_FILE_SIZE_BYTES } from "@/lib/videos/validation"

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

  // Validate file size against absolute max (tier-specific check is done client-side)
  if (fileSize > MAX_FILE_SIZE_BYTES) {
    const maxMB = MAX_FILE_SIZE_BYTES / (1024 * 1024)
    return NextResponse.json(
      { error: `File is too large. Maximum size is ${maxMB} MB.` },
      { status: 413 }
    )
  }

  // Generate storage path: {userId}/{uuid}{ext}
  const ext = getExtensionFromMime(contentType)
  const fileId = crypto.randomUUID()
  const storagePath = `${user.id}/${fileId}${ext}`

  return NextResponse.json({ storagePath })
}
