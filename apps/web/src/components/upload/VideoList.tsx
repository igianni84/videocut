"use client"

import { VideoCard } from "./VideoCard"
import type { Video } from "@/lib/videos/types"

type VideoListProps = {
  videos: Video[]
  onPlay: (video: Video) => void
  onDelete: (video: Video) => void
}

export function VideoList({ videos, onPlay, onDelete }: VideoListProps) {
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
          onPlay={onPlay}
          onDelete={onDelete}
        />
      ))}
    </div>
  )
}
