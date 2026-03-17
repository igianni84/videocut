"use client"

import { useCallback, useState } from "react"
import { useRouter } from "next/navigation"

import { useUpload } from "@/hooks/use-upload"
import { UploadZone } from "@/components/upload/UploadZone"
import { VideoList } from "@/components/upload/VideoList"
import { VideoPlayer } from "@/components/upload/VideoPlayer"
import { DeleteVideoDialog } from "@/components/upload/DeleteVideoDialog"
import type { Tier, Video } from "@/lib/videos/types"

type VideosPageClientProps = {
  initialVideos: Video[]
  tier: Tier
}

export function VideosPageClient({
  initialVideos,
  tier,
}: VideosPageClientProps) {
  const router = useRouter()
  const { state, upload, cancel, reset } = useUpload()
  const [playingVideo, setPlayingVideo] = useState<Video | null>(null)
  const [deletingVideo, setDeletingVideo] = useState<Video | null>(null)
  const [isDeleting, setIsDeleting] = useState(false)

  const handleUpload = useCallback(
    async (file: File, fileTier: Tier) => {
      const result = await upload(file, fileTier)
      if (result) {
        // Refresh server data after successful upload
        router.refresh()
      }
      return result
    },
    [upload, router]
  )

  const handleDelete = useCallback(async () => {
    if (!deletingVideo) return

    setIsDeleting(true)
    try {
      const res = await fetch(`/api/videos/${deletingVideo.id}`, {
        method: "DELETE",
      })

      if (res.ok) {
        setDeletingVideo(null)
        router.refresh()
      }
    } finally {
      setIsDeleting(false)
    }
  }, [deletingVideo, router])

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold">Videos</h1>
        <p className="text-muted-foreground">
          Upload and manage your videos
        </p>
      </div>

      <UploadZone
        tier={tier}
        state={state}
        onUpload={handleUpload}
        onCancel={cancel}
        onReset={reset}
      />

      {playingVideo && (
        <VideoPlayer
          video={playingVideo}
          onClose={() => setPlayingVideo(null)}
        />
      )}

      <VideoList
        videos={initialVideos}
        onPlay={setPlayingVideo}
        onDelete={setDeletingVideo}
      />

      <DeleteVideoDialog
        video={deletingVideo}
        open={!!deletingVideo && !isDeleting}
        onConfirm={handleDelete}
        onCancel={() => setDeletingVideo(null)}
      />
    </div>
  )
}
