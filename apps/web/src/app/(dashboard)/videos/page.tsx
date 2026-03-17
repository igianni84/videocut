import { redirect } from "next/navigation"

import { getProfile } from "@/lib/auth/actions"
import { getVideos } from "@/lib/videos/actions"
import { VideosPageClient } from "./VideosPageClient"

export const metadata = {
  title: "Videos — VideoCut",
}

export default async function VideosPage() {
  const profile = await getProfile()

  if (!profile) {
    redirect("/login")
  }

  const videos = await getVideos()

  return <VideosPageClient initialVideos={videos} tier={profile.tier} />
}
