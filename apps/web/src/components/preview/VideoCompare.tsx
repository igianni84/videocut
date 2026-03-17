"use client"

import { useEffect, useState } from "react"
import { X } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import type { Video } from "@/lib/videos/types"
import type { Job } from "@/lib/jobs/types"

type VideoCompareProps = {
  video: Video
  job: Job
  onClose: () => void
}

type Tab = "original" | "processed"

export function VideoCompare({ video, job, onClose }: VideoCompareProps) {
  const [activeTab, setActiveTab] = useState<Tab>("processed")
  const [originalUrl, setOriginalUrl] = useState<string | null>(null)
  const [processedUrl, setProcessedUrl] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false

    async function fetchUrls() {
      setLoading(true)
      try {
        // Fetch both signed URLs in parallel
        const [origRes, procRes] = await Promise.all([
          fetch(`/api/videos/${video.id}/signed-url?bucket=originals`),
          fetch(`/api/videos/${video.id}/download`),
        ])

        if (cancelled) return

        if (origRes.ok) {
          const origData = await origRes.json()
          setOriginalUrl(origData.signedUrl ?? origData.downloadUrl)
        }
        if (procRes.ok) {
          const procData = await procRes.json()
          setProcessedUrl(procData.downloadUrl)
        }
      } catch {
        // URLs will remain null — video element won't load
      } finally {
        if (!cancelled) setLoading(false)
      }
    }

    fetchUrls()
    return () => { cancelled = true }
  }, [video.id])

  const currentUrl = activeTab === "original" ? originalUrl : processedUrl

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
      <Card className="mx-4 w-full max-w-3xl">
        <CardHeader className="flex flex-row items-center justify-between pb-2">
          <CardTitle className="text-sm font-medium line-clamp-1">
            {video.original_filename}
          </CardTitle>
          <Button variant="ghost" size="icon" className="h-8 w-8" onClick={onClose}>
            <X className="h-4 w-4" />
          </Button>
        </CardHeader>
        <CardContent className="space-y-3">
          {/* Tabs */}
          <div className="flex gap-1">
            <Button
              size="sm"
              variant={activeTab === "original" ? "default" : "outline"}
              onClick={() => setActiveTab("original")}
            >
              Original
            </Button>
            <Button
              size="sm"
              variant={activeTab === "processed" ? "default" : "outline"}
              onClick={() => setActiveTab("processed")}
            >
              Processed
            </Button>
          </div>

          {/* Video player */}
          <div className="aspect-video w-full overflow-hidden rounded-lg bg-black">
            {loading ? (
              <div className="flex h-full items-center justify-center text-sm text-white/60">
                Loading...
              </div>
            ) : currentUrl ? (
              <video
                key={currentUrl}
                src={currentUrl}
                controls
                className="h-full w-full object-contain"
              />
            ) : (
              <div className="flex h-full items-center justify-center text-sm text-white/60">
                Video unavailable
              </div>
            )}
          </div>

          {/* Metadata */}
          {activeTab === "processed" && job && (
            <div className="flex flex-wrap gap-3 text-xs text-muted-foreground">
              {job.output_duration_seconds != null && (
                <span>
                  Duration: {Math.round(job.output_duration_seconds)}s
                  {video.duration_seconds > 0 && (
                    <> ({Math.round((1 - job.output_duration_seconds / video.duration_seconds) * 100)}% shorter)</>
                  )}
                </span>
              )}
              {job.output_width && job.output_height && (
                <span>
                  Resolution: {job.output_width}&times;{job.output_height}
                </span>
              )}
              {job.processing_duration_ms != null && (
                <span>
                  Processed in {(job.processing_duration_ms / 1000).toFixed(1)}s
                </span>
              )}
            </div>
          )}
          {activeTab === "original" && (
            <div className="flex flex-wrap gap-3 text-xs text-muted-foreground">
              <span>Duration: {Math.round(video.duration_seconds)}s</span>
              {video.width && video.height && (
                <span>
                  Resolution: {video.width}&times;{video.height}
                </span>
              )}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
