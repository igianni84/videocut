"use client"

import { Progress, ProgressLabel, ProgressValue } from "@/components/ui/progress"
import { useJobStatus } from "@/hooks/use-job-status"
import { JobStatusBadge } from "./JobStatusBadge"

type JobProgressProps = {
  jobId: string
  onComplete?: () => void
}

export function JobProgress({ jobId, onComplete }: JobProgressProps) {
  const { job } = useJobStatus(jobId)

  if (!job) return null

  // Notify parent when job completes
  if (
    (job.status === "completed" || job.status === "failed") &&
    onComplete
  ) {
    onComplete()
  }

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center justify-between">
        <JobStatusBadge status={job.status} progress={job.progress} />
        {job.error_message && job.status === "failed" && (
          <span className="text-xs text-destructive">{job.error_message}</span>
        )}
      </div>
      {(job.status === "queued" || job.status === "processing") && (
        <Progress value={job.progress}>
          <ProgressLabel>Processing</ProgressLabel>
          <ProgressValue />
        </Progress>
      )}
    </div>
  )
}
