"use client"

import { useState } from "react"
import { Clock, Download, Eye } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { DownloadButton } from "@/components/preview/DownloadButton"
import { VideoCompare } from "@/components/preview/VideoCompare"
import type { Job } from "@/lib/jobs/types"
import type { Video } from "@/lib/videos/types"

type CompletedJobWithVideo = Job & {
  videos: {
    original_filename: string
    storage_path: string
    duration_seconds: number
  } | null
}

type HistoryPageClientProps = {
  completedJobs: CompletedJobWithVideo[]
}

function daysUntilExpiry(completedAt: string | null): number {
  if (!completedAt) return 0
  const completed = new Date(completedAt)
  const expiry = new Date(completed.getTime() + 30 * 24 * 60 * 60 * 1000)
  const now = new Date()
  return Math.max(0, Math.ceil((expiry.getTime() - now.getTime()) / (1000 * 60 * 60 * 24)))
}

function formatDate(iso: string | null): string {
  if (!iso) return "—"
  return new Date(iso).toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  })
}

export function HistoryPageClient({ completedJobs }: HistoryPageClientProps) {
  const [comparingData, setComparingData] = useState<{
    video: Video
    job: Job
  } | null>(null)

  if (completedJobs.length === 0) {
    return (
      <div className="flex flex-col gap-6">
        <div>
          <h1 className="text-2xl font-semibold">History</h1>
          <p className="text-muted-foreground">
            Your processed videos
          </p>
        </div>
        <p className="py-8 text-center text-sm text-muted-foreground">
          No processed videos yet. Process your first video from the Videos page!
        </p>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold">History</h1>
        <p className="text-muted-foreground">
          Your processed videos
        </p>
      </div>

      {comparingData && (
        <VideoCompare
          video={comparingData.video}
          job={comparingData.job}
          onClose={() => setComparingData(null)}
        />
      )}

      <div className="grid gap-4 sm:grid-cols-2">
        {completedJobs.map((job) => {
          const videoData = job.videos
          if (!videoData) return null

          const daysLeft = daysUntilExpiry(job.completed_at)
          const originalDuration = videoData.duration_seconds
          const processedDuration = job.output_duration_seconds ?? originalDuration

          // Construct a minimal Video object for the compare component
          const videoForCompare = {
            id: job.video_id,
            user_id: job.user_id,
            original_filename: videoData.original_filename,
            storage_path: videoData.storage_path,
            duration_seconds: originalDuration,
            file_size_bytes: 0,
            mime_type: "video/mp4",
            width: null,
            height: null,
            status: "completed",
            created_at: job.created_at,
            updated_at: job.updated_at,
          } satisfies Video

          return (
            <Card key={job.id}>
              <CardContent className="pt-4 space-y-3">
                <div className="flex items-start justify-between">
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium line-clamp-1">
                      {videoData.original_filename}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {formatDate(job.completed_at)}
                    </p>
                  </div>
                  <Badge
                    variant={daysLeft <= 5 ? "destructive" : "secondary"}
                    className="ml-2 shrink-0"
                  >
                    <Clock className="mr-1 h-3 w-3" />
                    {daysLeft}d left
                  </Badge>
                </div>

                <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
                  <span>
                    {Math.round(originalDuration)}s → {Math.round(processedDuration)}s
                    {originalDuration > 0 && (
                      <> ({Math.round((1 - processedDuration / originalDuration) * 100)}%)</>
                    )}
                  </span>
                  {job.output_width && job.output_height && (
                    <span>
                      {job.output_width}&times;{job.output_height}
                    </span>
                  )}
                  {job.processing_duration_ms != null && (
                    <span>
                      {(job.processing_duration_ms / 1000).toFixed(1)}s processing
                    </span>
                  )}
                </div>

                <div className="flex gap-2">
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => setComparingData({ video: videoForCompare, job })}
                  >
                    <Eye className="mr-1 h-3 w-3" />
                    Preview
                  </Button>
                  <DownloadButton
                    videoId={job.video_id}
                    filename={`${videoData.original_filename.replace(/\.[^.]+$/, "")}_processed.mp4`}
                  />
                </div>
              </CardContent>
            </Card>
          )
        })}
      </div>
    </div>
  )
}
