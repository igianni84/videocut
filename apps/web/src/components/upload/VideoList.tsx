"use client"

import { VideoCard } from "./VideoCard"
import type { Video } from "@/lib/videos/types"
import type { Job } from "@/lib/jobs/types"

type VideoListProps = {
  videos: Video[]
  jobsByVideo: Record<string, Job>
  tier?: string
  onPlay: (video: Video) => void
  onDelete: (video: Video) => void
  onProcess: (videoId: string) => void
  onPreview?: (video: Video, job: Job) => void
  onJobComplete?: () => void
}

export function VideoList({
  videos,
  jobsByVideo,
  tier,
  onPlay,
  onDelete,
  onProcess,
  onPreview,
  onJobComplete,
}: VideoListProps) {
  if (videos.length === 0) {
    return (
      <p className="py-8 text-center text-sm text-muted-foreground">
        No videos yet. Upload your first video above!
      </p>
    )
  }

  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {videos.map((video) => (
        <VideoCard
          key={video.id}
          video={video}
          latestJob={jobsByVideo[video.id] ?? null}
          tier={tier}
          onPlay={onPlay}
          onDelete={onDelete}
          onProcess={onProcess}
          onPreview={onPreview}
          onJobComplete={onJobComplete}
        />
      ))}
    </div>
  )
}
