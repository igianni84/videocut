"use client"

import { X } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Progress } from "@/components/ui/progress"
import type { UploadState } from "@/lib/videos/types"

const PHASE_LABELS: Record<string, string> = {
  validating: "Validating video...",
  "requesting-url": "Preparing upload...",
  uploading: "Uploading...",
  registering: "Saving...",
  complete: "Upload complete!",
  error: "Upload failed",
}

type UploadProgressProps = {
  state: UploadState
  filename: string
  onCancel: () => void
}

export function UploadProgress({
  state,
  filename,
  onCancel,
}: UploadProgressProps) {
  const label = PHASE_LABELS[state.phase] ?? ""
  const showCancel = state.phase === "uploading" || state.phase === "validating"

  return (
    <div className="flex flex-col gap-2 rounded-lg border p-4">
      <div className="flex items-center justify-between">
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium">{filename}</p>
          <p className="text-xs text-muted-foreground">{label}</p>
        </div>
        {showCancel && (
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8 shrink-0"
            onClick={onCancel}
          >
            <X className="h-4 w-4" />
          </Button>
        )}
      </div>
      {state.phase === "uploading" && (
        <Progress value={state.progress} className="h-2" />
      )}
      {state.error && (
        <p className="text-sm text-destructive">{state.error}</p>
      )}
    </div>
  )
}
