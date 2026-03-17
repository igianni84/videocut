"use client"

import { useEffect, useState } from "react"
import { X } from "lucide-react"
import { Button } from "@/components/ui/button"
import { createClient } from "@/lib/supabase/client"
import type { Video } from "@/lib/videos/types"

type VideoPlayerProps = {
  video: Video
  onClose: () => void
}

export function VideoPlayer({ video, onClose }: VideoPlayerProps) {
  const [url, setUrl] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const supabase = createClient()

    const { data } = supabase.storage
      .from("originals")
      .getPublicUrl(video.storage_path)

    if (data?.publicUrl) {
      // Use signed URL for private buckets
      supabase.storage
        .from("originals")
        .createSignedUrl(video.storage_path, 3600)
        .then(({ data: signedData, error: signedError }) => {
          if (signedError || !signedData?.signedUrl) {
            setError("Failed to load video")
          } else {
            setUrl(signedData.signedUrl)
          }
        })
    }
  }, [video.storage_path])

  return (
    <div className="overflow-hidden rounded-lg border bg-black">
      <div className="flex items-center justify-between border-b bg-zinc-900 px-4 py-2">
        <p className="truncate text-sm text-white">
          {video.original_filename}
        </p>
        <Button
          variant="ghost"
          size="icon"
          className="h-8 w-8 text-white hover:text-white/80"
          onClick={onClose}
        >
          <X className="h-4 w-4" />
        </Button>
      </div>
      <div className="flex aspect-video items-center justify-center">
        {error ? (
          <p className="text-sm text-red-400">{error}</p>
        ) : url ? (
          <video
            src={url}
            controls
            className="h-full w-full"
            autoPlay
          >
            <track kind="captions" />
          </video>
        ) : (
          <p className="text-sm text-zinc-400">Loading...</p>
        )}
      </div>
    </div>
  )
}
