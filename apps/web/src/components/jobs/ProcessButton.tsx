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
  const [error, setError] = useState<string | null>(null)

  const handleProcess = async () => {
    setIsLoading(true)
    setError(null)
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
      const message = err instanceof Error ? err.message : "Failed to start processing"
      setError(message)
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <div>
      <Button
        size="sm"
        variant="default"
        onClick={handleProcess}
        disabled={disabled || isLoading}
      >
        <Scissors className="mr-1 h-3 w-3" />
        {isLoading ? "Starting..." : "Process"}
      </Button>
      {error && (
        <p className="mt-1 text-xs text-destructive">{error}</p>
      )}
    </div>
  )
}
