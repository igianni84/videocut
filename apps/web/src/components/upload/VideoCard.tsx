"use client"

import { MoreVertical, Play, Trash2 } from "lucide-react"
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
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { formatDuration, formatFileSize } from "@/lib/videos/validation"
import type { Video } from "@/lib/videos/types"

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
  onPlay: (video: Video) => void
  onDelete: (video: Video) => void
}

export function VideoCard({ video, onPlay, onDelete }: VideoCardProps) {
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
              Play
            </DropdownMenuItem>
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
        <div className="mt-2">
          <Badge variant={STATUS_VARIANT[video.status] ?? "secondary"}>
            {video.status}
          </Badge>
        </div>
      </CardContent>
    </Card>
  )
}
