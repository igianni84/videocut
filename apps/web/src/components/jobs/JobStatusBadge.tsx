"use client"

import { Badge } from "@/components/ui/badge"
import type { JobStatus } from "@/lib/jobs/types"

const STATUS_CONFIG: Record<
  JobStatus,
  { label: string; variant: "default" | "secondary" | "destructive" | "outline" }
> = {
  queued: { label: "Queued", variant: "outline" },
  processing: { label: "Processing", variant: "default" },
  completed: { label: "Completed", variant: "secondary" },
  failed: { label: "Failed", variant: "destructive" },
}

type JobStatusBadgeProps = {
  status: JobStatus
  progress?: number
}

export function JobStatusBadge({ status, progress }: JobStatusBadgeProps) {
  const config = STATUS_CONFIG[status]

  return (
    <Badge variant={config.variant}>
      {config.label}
      {status === "processing" && progress !== undefined && (
        <span className="ml-1">{progress}%</span>
      )}
    </Badge>
  )
}
