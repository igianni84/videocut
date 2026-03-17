import { redirect } from "next/navigation"

import { getProfile } from "@/lib/auth/actions"
import { getCompletedJobsWithVideos } from "@/lib/jobs/actions"
import { HistoryPageClient } from "./HistoryPageClient"

export const metadata = {
  title: "History — VideoCut",
}

export default async function HistoryPage() {
  const profile = await getProfile()

  if (!profile) {
    redirect("/login")
  }

  const completedJobs = await getCompletedJobsWithVideos()

  return <HistoryPageClient completedJobs={completedJobs} />
}
