import { NextResponse } from "next/server"
import { createClient } from "@supabase/supabase-js"
import type { Database } from "@/types/database.types"

const EXPIRY_DAYS = 30

export async function GET(request: Request) {
  // Verify Vercel cron secret
  const authHeader = request.headers.get("authorization")
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  // Use service-role client for cleanup (bypasses RLS)
  const supabase = createClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )

  const cutoff = new Date()
  cutoff.setDate(cutoff.getDate() - EXPIRY_DAYS)

  // Find expired jobs with output files
  const { data: expiredJobs, error: queryError } = await supabase
    .from("jobs")
    .select("id, output_storage_path")
    .eq("status", "completed")
    .not("output_storage_path", "is", null)
    .lt("completed_at", cutoff.toISOString())

  if (queryError) {
    return NextResponse.json({ error: queryError.message }, { status: 500 })
  }

  if (!expiredJobs || expiredJobs.length === 0) {
    return NextResponse.json({ cleaned: 0 })
  }

  // Delete files from storage
  const storagePaths = expiredJobs
    .map((j) => j.output_storage_path)
    .filter((p): p is string => p !== null)

  if (storagePaths.length > 0) {
    const { error: storageError } = await supabase.storage
      .from("processed")
      .remove(storagePaths)

    if (storageError) {
      console.error("Storage cleanup error:", storageError.message)
    }
  }

  // Null out output_storage_path on cleaned jobs
  const jobIds = expiredJobs.map((j) => j.id)
  const { error: updateError } = await supabase
    .from("jobs")
    .update({ output_storage_path: null })
    .in("id", jobIds)

  if (updateError) {
    console.error("Job cleanup update error:", updateError.message)
  }

  return NextResponse.json({ cleaned: expiredJobs.length })
}
