"use client"

import { useState } from "react"
import { Scissors } from "lucide-react"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { SubtitleCustomizer } from "@/components/subtitles/SubtitleCustomizer"
import { SubtitlePreview } from "@/components/subtitles/SubtitlePreview"
import {
  DEFAULT_SUBTITLE_OPTIONS,
  type SubtitleOptions,
} from "@/lib/subtitles/types"
import type { ProcessingOptionsPayload } from "@/lib/jobs/types"

type ProcessingOptionsDialogProps = {
  videoId: string
  disabled?: boolean
  onProcessStarted?: (jobId: string) => void
}

function subtitleOptionsToPayload(opts: SubtitleOptions): ProcessingOptionsPayload {
  return {
    subtitle_enabled: opts.enabled,
    subtitle_font: opts.font,
    subtitle_size: opts.size,
    subtitle_color_base: opts.colorBase,
    subtitle_color_highlight: opts.colorHighlight,
    subtitle_position: opts.position,
    subtitle_outline: opts.outline,
    subtitle_shadow: opts.shadow,
    subtitle_language: opts.language,
  }
}

export function ProcessingOptionsDialog({
  videoId,
  disabled,
  onProcessStarted,
}: ProcessingOptionsDialogProps) {
  const [open, setOpen] = useState(false)
  const [isLoading, setIsLoading] = useState(false)
  const [subtitleOptions, setSubtitleOptions] = useState<SubtitleOptions>(
    DEFAULT_SUBTITLE_OPTIONS
  )

  const handleProcess = async () => {
    setIsLoading(true)
    try {
      const options: ProcessingOptionsPayload = subtitleOptionsToPayload(subtitleOptions)

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
      setOpen(false)
      onProcessStarted?.(data.id)
    } catch (err) {
      console.error("Failed to start processing:", err)
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger
        render={
          <Button size="sm" variant="default" disabled={disabled}>
            <Scissors className="mr-1 h-3 w-3" />
            Process
          </Button>
        }
      />
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Processing Options</DialogTitle>
          <DialogDescription>
            Configure subtitles and processing settings.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <SubtitlePreview options={subtitleOptions} />
          <SubtitleCustomizer
            value={subtitleOptions}
            onChange={setSubtitleOptions}
          />
        </div>

        <DialogFooter>
          <Button
            onClick={handleProcess}
            disabled={isLoading}
          >
            <Scissors className="mr-1 h-4 w-4" />
            {isLoading ? "Starting..." : "Start Processing"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
