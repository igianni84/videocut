"use client"

import { useState } from "react"
import { Scissors } from "lucide-react"
import { Button } from "@/components/ui/button"
import type { ProcessingOptionsPayload } from "@/lib/jobs/types"

type ProcessButtonProps = {
  videoId: string
  disabled?: boolean
  onProcessStarted?: (jobId: string) => void
}

export function ProcessButton({ videoId, disabled, onProcessStarted }: ProcessButtonProps) {
  const [isLoading, setIsLoading] = useState(false)

  const handleProcess = async () => {
    setIsLoading(true)
    try {
      const options: ProcessingOptionsPayload = {}
      const res = await fetch("/api/jobs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ videoId, options }),
      })

      if (!res.ok) {
        const data = await res.json()
        throw new Error(data.error ?? "Failed to start processing")
      }

      const data = await res.json()
      onProcessStarted?.(data.id)
    } catch (err) {
      // Error is shown via job status — no need for toast here
      console.error("Failed to start processing:", err)
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <Button
      size="sm"
      variant="default"
      onClick={handleProcess}
      disabled={disabled || isLoading}
    >
      <Scissors className="mr-1 h-3 w-3" />
      {isLoading ? "Starting..." : "Process"}
    </Button>
  )
}
