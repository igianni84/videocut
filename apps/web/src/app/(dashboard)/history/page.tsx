import { Suspense } from "react"
import { redirect } from "next/navigation"

import { getProfile } from "@/lib/auth/actions"
import { getCompletedJobsWithVideos } from "@/lib/jobs/actions"
import { HistoryPageClient } from "./HistoryPageClient"
import { HistorySkeleton } from "@/components/upload/VideoCardSkeleton"

export const metadata = {
  title: "History — VideoCut",
}

export default function HistoryPage() {
  return (
    <Suspense fallback={<HistorySkeleton />}>
      <HistoryContent />
    </Suspense>
  )
}

async function HistoryContent() {
  const profile = await getProfile()

  if (!profile) {
    redirect("/login")
  }

  const completedJobs = await getCompletedJobsWithVideos()

  return <HistoryPageClient completedJobs={completedJobs} />
}
