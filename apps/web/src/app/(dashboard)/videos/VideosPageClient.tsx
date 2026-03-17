"use client"

import { useCallback, useMemo, useState } from "react"
import { useRouter } from "next/navigation"

import { useUpload } from "@/hooks/use-upload"
import { UploadZone } from "@/components/upload/UploadZone"
import { VideoList } from "@/components/upload/VideoList"
import { VideoPlayer } from "@/components/upload/VideoPlayer"
import { DeleteVideoDialog } from "@/components/upload/DeleteVideoDialog"
import type { Tier, Video } from "@/lib/videos/types"
import type { Job } from "@/lib/jobs/types"

type VideosPageClientProps = {
  initialVideos: Video[]
  initialJobs: Job[]
  tier: Tier
}

export function VideosPageClient({
  initialVideos,
  initialJobs,
  tier,
}: VideosPageClientProps) {
  const router = useRouter()
  const { state, upload, cancel, reset } = useUpload()
  const [playingVideo, setPlayingVideo] = useState<Video | null>(null)
  const [deletingVideo, setDeletingVideo] = useState<Video | null>(null)
  const [isDeleting, setIsDeleting] = useState(false)

  // Build a map of videoId -> latest job
  const jobsByVideo = useMemo(() => {
    const map: Record<string, Job> = {}
    for (const job of initialJobs) {
      // initialJobs is sorted by created_at desc, so first occurrence is latest
      if (!map[job.video_id]) {
        map[job.video_id] = job
      }
    }
    return map
  }, [initialJobs])

  const handleUpload = useCallback(
    async (file: File, fileTier: Tier) => {
      const result = await upload(file, fileTier)
      if (result) {
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

  const handleProcess = useCallback(() => {
    router.refresh()
  }, [router])

  const handleJobComplete = useCallback(() => {
    router.refresh()
  }, [router])

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
        jobsByVideo={jobsByVideo}
        onPlay={setPlayingVideo}
        onDelete={setDeletingVideo}
        onProcess={handleProcess}
        onJobComplete={handleJobComplete}
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
