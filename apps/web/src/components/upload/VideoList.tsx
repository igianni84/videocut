"use client"

import { VideoCard } from "./VideoCard"
import type { Video } from "@/lib/videos/types"
import type { Job } from "@/lib/jobs/types"

type VideoListProps = {
  videos: Video[]
  jobsByVideo: Record<string, Job>
  onPlay: (video: Video) => void
  onDelete: (video: Video) => void
  onProcess: (videoId: string) => void
  onJobComplete?: () => void
}

export function VideoList({
  videos,
  jobsByVideo,
  onPlay,
  onDelete,
  onProcess,
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
          onPlay={onPlay}
          onDelete={onDelete}
          onProcess={onProcess}
          onJobComplete={onJobComplete}
        />
      ))}
    </div>
  )
}
