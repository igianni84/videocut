"use client"

import { Download, Eye, MoreVertical, Play, Trash2 } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { formatDuration, formatFileSize } from "@/lib/videos/validation"
import { ProcessingOptionsDialog } from "@/components/jobs/ProcessingOptionsDialog"
import { JobProgress } from "@/components/jobs/JobProgress"
import { DownloadButton } from "@/components/preview/DownloadButton"
import type { Video } from "@/lib/videos/types"
import type { Job } from "@/lib/jobs/types"

const STATUS_VARIANT: Record<
  string,
  "default" | "secondary" | "destructive" | "outline"
> = {
  uploaded: "secondary",
  processing: "default",
  completed: "default",
  failed: "destructive",
}

const STATUS_BORDER: Record<string, string> = {
  uploaded: "border-l-muted-foreground/40",
  processing: "border-l-primary",
  completed: "border-l-green-500",
  failed: "border-l-destructive",
}

type VideoCardProps = {
  video: Video
  latestJob?: Job | null
  tier?: string
  onPlay: (video: Video) => void
  onDelete: (video: Video) => void
  onProcess: (videoId: string) => void
  onPreview?: (video: Video, job: Job) => void
  onJobComplete?: () => void
}

export function VideoCard({
  video,
  latestJob,
  tier,
  onPlay,
  onDelete,
  onProcess,
  onPreview,
  onJobComplete,
}: VideoCardProps) {
  const isProcessing = latestJob?.status === "queued" || latestJob?.status === "processing"
  const canProcess = video.status === "uploaded" || (video.status === "completed" && !isProcessing)
  const isCompleted = latestJob?.status === "completed"
  const effectiveStatus = isCompleted
    ? "completed"
    : isProcessing
      ? "processing"
      : latestJob?.status === "failed"
        ? "failed"
        : video.status

  return (
    <Card
      className={`animate-fade-in-up overflow-hidden border-l-4 ${STATUS_BORDER[effectiveStatus] ?? "border-l-muted-foreground/40"}`}
    >
      {/* Thumbnail placeholder */}
      <button
        type="button"
        onClick={() => onPlay(video)}
        className="relative flex aspect-video w-full items-center justify-center bg-gradient-to-br from-muted to-muted/50 transition-opacity hover:opacity-80"
      >
        <div className="flex h-10 w-10 items-center justify-center rounded-full bg-black/50 text-white">
          <Play className="ml-0.5 h-5 w-5" />
        </div>
      </button>

      <CardHeader className="flex flex-row items-start justify-between space-y-0 pb-2">
        <div className="flex min-w-0 flex-1 items-center gap-2">
          <CardTitle className="line-clamp-1 text-sm font-medium">
            {video.original_filename}
          </CardTitle>
          {isCompleted ? (
            <Badge variant="default" className="shrink-0 bg-green-600">
              completed
            </Badge>
          ) : !isProcessing ? (
            <Badge variant={STATUS_VARIANT[video.status] ?? "secondary"} className="shrink-0">
              {video.status}
            </Badge>
          ) : null}
        </div>
        <DropdownMenu>
          <DropdownMenuTrigger
            render={<Button variant="ghost" size="icon" className="h-8 w-8 shrink-0" />}
          >
            <MoreVertical className="h-4 w-4" />
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onClick={() => onPlay(video)}>
              <Play className="mr-2 h-4 w-4" />
              Play Original
            </DropdownMenuItem>
            {isCompleted && latestJob && (
              <>
                <DropdownMenuItem onClick={() => onPreview?.(video, latestJob)}>
                  <Eye className="mr-2 h-4 w-4" />
                  Compare Original vs Processed
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => {
                  fetch(`/api/videos/${video.id}/download`)
                    .then((r) => r.json())
                    .then(({ downloadUrl, filename }) => {
                      const a = document.createElement("a")
                      a.href = downloadUrl
                      a.download = filename
                      document.body.appendChild(a)
                      a.click()
                      document.body.removeChild(a)
                    })
                    .catch(console.error)
                }}>
                  <Download className="mr-2 h-4 w-4" />
                  Download
                </DropdownMenuItem>
              </>
            )}
            <DropdownMenuSeparator />
            <DropdownMenuItem
              className="text-destructive"
              onClick={() => onDelete(video)}
            >
              <Trash2 className="mr-2 h-4 w-4" />
              Delete
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </CardHeader>

      <CardContent>
        {/* Metadata as badge pills */}
        <div className="flex flex-wrap items-center gap-1.5">
          <Badge variant="outline" className="text-xs font-normal">
            {formatDuration(video.duration_seconds)}
          </Badge>
          <Badge variant="outline" className="text-xs font-normal">
            {formatFileSize(video.file_size_bytes)}
          </Badge>
          {video.width && video.height && (
            <Badge variant="outline" className="text-xs font-normal">
              {video.width}&times;{video.height}
            </Badge>
          )}
        </div>

        {canProcess && (
          <div className="mt-2">
            <ProcessingOptionsDialog
              videoId={video.id}
              disabled={isProcessing}
              tier={tier}
              onProcessStarted={() => onProcess(video.id)}
            />
          </div>
        )}

        {/* Completed job: preview + download buttons */}
        {isCompleted && latestJob && (
          <div className="mt-2 flex items-center gap-2">
            <Button
              size="sm"
              variant="outline"
              onClick={() => onPreview?.(video, latestJob)}
            >
              <Eye className="mr-1 h-3 w-3" />
              Preview
            </Button>
            <DownloadButton
              videoId={video.id}
              filename={`${video.original_filename.replace(/\.[^.]+$/, "")}_processed.mp4`}
            />
          </div>
        )}

        {latestJob && !isCompleted && (
          <div className="mt-2">
            <JobProgress jobId={latestJob.id} onComplete={onJobComplete} />
          </div>
        )}
      </CardContent>
    </Card>
  )
}
