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

  return (
    <Card>
      <CardHeader className="flex flex-row items-start justify-between space-y-0 pb-2">
        <CardTitle className="line-clamp-1 text-sm font-medium">
          {video.original_filename}
        </CardTitle>
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
                  // Trigger download via the API
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
        <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
          <span>{formatDuration(video.duration_seconds)}</span>
          <span>&middot;</span>
          <span>{formatFileSize(video.file_size_bytes)}</span>
          {video.width && video.height && (
            <>
              <span>&middot;</span>
              <span>
                {video.width}&times;{video.height}
              </span>
            </>
          )}
        </div>

        <div className="mt-2 flex items-center gap-2">
          {!latestJob && (
            <Badge variant={STATUS_VARIANT[video.status] ?? "secondary"}>
              {video.status}
            </Badge>
          )}
          {canProcess && (
            <ProcessingOptionsDialog
              videoId={video.id}
              disabled={isProcessing}
              tier={tier}
              onProcessStarted={() => onProcess(video.id)}
            />
          )}
        </div>

        {/* Completed job: preview + download buttons */}
        {isCompleted && latestJob && (
          <div className="mt-2 flex items-center gap-2">
            <Badge variant="default">completed</Badge>
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
