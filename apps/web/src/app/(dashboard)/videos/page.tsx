import { redirect } from "next/navigation"

import { getProfile } from "@/lib/auth/actions"
import { getVideos } from "@/lib/videos/actions"
import { getJobs } from "@/lib/jobs/actions"
import { VideosPageClient } from "./VideosPageClient"

export const metadata = {
  title: "Videos — VideoCut",
}

export default async function VideosPage() {
  const profile = await getProfile()

  if (!profile) {
    redirect("/login")
  }

  const [videos, jobs] = await Promise.all([getVideos(), getJobs()])

  return (
    <VideosPageClient
      initialVideos={videos}
      initialJobs={jobs}
      tier={profile.tier}
    />
  )
}
