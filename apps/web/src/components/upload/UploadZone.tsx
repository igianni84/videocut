"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import { Upload } from "lucide-react"
import { toast } from "sonner"
import { ACCEPTED_MIME_TYPES } from "@/lib/videos/validation"
import { UploadProgress } from "./UploadProgress"
import type { Tier, UploadState } from "@/lib/videos/types"

type UploadZoneProps = {
  tier: Tier
  state: UploadState
  onUpload: (file: File, tier: Tier) => Promise<unknown>
  onCancel: () => void
  onReset: () => void
}

export function UploadZone({
  tier,
  state,
  onUpload,
  onCancel,
  onReset,
}: UploadZoneProps) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [dragOver, setDragOver] = useState(false)
  const [filename, setFilename] = useState("")
  const lastPhaseRef = useRef(state.phase)

  const isIdle = state.phase === "idle"
  const isComplete = state.phase === "complete"
  const isError = state.phase === "error"
  const isBusy = !isIdle && !isComplete && !isError

  // Toast notifications on state changes
  useEffect(() => {
    if (state.phase === lastPhaseRef.current) return
    lastPhaseRef.current = state.phase

    if (state.phase === "complete") {
      toast.success(`"${filename}" uploaded successfully!`)
    }
    if (state.phase === "error" && state.error) {
      toast.error(state.error)
    }
  }, [state.phase, state.error, filename])

  const handleFile = useCallback(
    (file: File) => {
      setFilename(file.name)
      onUpload(file, tier)
    },
    [onUpload, tier]
  )

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault()
      setDragOver(false)
      const file = e.dataTransfer.files[0]
      if (file) handleFile(file)
    },
    [handleFile]
  )

  const handleChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0]
      if (file) handleFile(file)
      // Reset input so re-selecting same file works
      e.target.value = ""
    },
    [handleFile]
  )

  if (isBusy) {
    return <UploadProgress state={state} filename={filename} onCancel={onCancel} />
  }

  if (isComplete) {
    return (
      <div className="flex flex-col items-center gap-2 rounded-lg border border-dashed p-8">
        <p className="text-sm text-muted-foreground">
          Ready for another?
        </p>
        <button
          className="text-sm text-primary underline"
          onClick={onReset}
        >
          Upload another video
        </button>
      </div>
    )
  }

  return (
    <div>
      <div
        role="button"
        tabIndex={0}
        className={`flex cursor-pointer flex-col items-center gap-3 rounded-lg border-2 border-dashed p-8 transition-all duration-200 ${
          dragOver
            ? "border-primary bg-primary/5 scale-[1.01]"
            : "border-muted-foreground/25 hover:border-primary/50"
        }`}
        onClick={() => inputRef.current?.click()}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") inputRef.current?.click()
        }}
        onDragOver={(e) => {
          e.preventDefault()
          setDragOver(true)
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={handleDrop}
      >
        <Upload className="h-8 w-8 text-muted-foreground" />
        <div className="text-center">
          <p className="text-sm font-medium">
            Drop a video here or click to browse
          </p>
          <p className="text-xs text-muted-foreground">
            MP4, MOV, WebM — max 500 MB — max{" "}
            {tier === "pro" ? "3 min" : "60 sec"}
          </p>
        </div>
      </div>
      <input
        ref={inputRef}
        type="file"
        accept={ACCEPTED_MIME_TYPES.join(",")}
        className="hidden"
        onChange={handleChange}
      />
    </div>
  )
}
