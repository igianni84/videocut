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
import { Separator } from "@/components/ui/separator"
import { Label } from "@/components/ui/label"
import { SubtitleCustomizer } from "@/components/subtitles/SubtitleCustomizer"
import { SubtitlePreview } from "@/components/subtitles/SubtitlePreview"
import { SpeedControl } from "@/components/processing/SpeedControl"
import { FillerRemoval } from "@/components/processing/FillerRemoval"
import { FormatSelector } from "@/components/processing/FormatSelector"
import {
  DEFAULT_SUBTITLE_OPTIONS,
  type SubtitleOptions,
} from "@/lib/subtitles/types"
import {
  DEFAULT_ADVANCED_OPTIONS,
  type AdvancedOptions,
  type SpeedMode,
  type OutputFormat,
  type TargetPlatform,
} from "@/lib/processing/types"
import type { ProcessingOptionsPayload } from "@/lib/jobs/types"

type ProcessingOptionsDialogProps = {
  videoId: string
  disabled?: boolean
  onProcessStarted?: (jobId: string) => void
}

function optionsToPayload(
  subtitle: SubtitleOptions,
  advanced: AdvancedOptions,
): ProcessingOptionsPayload {
  return {
    subtitle_enabled: subtitle.enabled,
    subtitle_font: subtitle.font,
    subtitle_size: subtitle.size,
    subtitle_color_base: subtitle.colorBase,
    subtitle_color_highlight: subtitle.colorHighlight,
    subtitle_position: subtitle.position,
    subtitle_outline: subtitle.outline,
    subtitle_shadow: subtitle.shadow,
    subtitle_language: subtitle.language,
    output_format: advanced.outputFormat,
    speed_mode: advanced.speedMode,
    speed_value: advanced.speedValue,
    remove_fillers: advanced.removeFillers,
    filler_language: advanced.fillerLanguage,
    smart_crop: advanced.smartCrop,
    target_platform: advanced.targetPlatform,
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
  const [advancedOptions, setAdvancedOptions] = useState<AdvancedOptions>(
    DEFAULT_ADVANCED_OPTIONS
  )

  const updateAdvanced = (partial: Partial<AdvancedOptions>) => {
    setAdvancedOptions((prev) => ({ ...prev, ...partial }))
  }

  const handleProcess = async () => {
    setIsLoading(true)
    try {
      const options = optionsToPayload(subtitleOptions, advancedOptions)

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
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Processing Options</DialogTitle>
          <DialogDescription>
            Configure subtitles, speed, filler removal, and format.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 max-h-[60vh] overflow-y-auto pr-1">
          {/* Subtitles */}
          <div className="space-y-3">
            <Label className="text-sm font-semibold">Subtitles</Label>
            <SubtitlePreview
              options={subtitleOptions}
              outputFormat={advancedOptions.outputFormat}
              targetPlatform={advancedOptions.targetPlatform}
            />
            <SubtitleCustomizer
              value={subtitleOptions}
              onChange={setSubtitleOptions}
            />
          </div>

          <Separator />

          {/* Speed */}
          <div className="space-y-3">
            <Label className="text-sm font-semibold">Speed</Label>
            <SpeedControl
              speedMode={advancedOptions.speedMode}
              speedValue={advancedOptions.speedValue}
              onSpeedModeChange={(mode) => updateAdvanced({ speedMode: mode })}
              onSpeedValueChange={(value) => updateAdvanced({ speedValue: value })}
            />
          </div>

          <Separator />

          {/* Filler Removal */}
          <div className="space-y-3">
            <Label className="text-sm font-semibold">Filler Removal</Label>
            <FillerRemoval
              enabled={advancedOptions.removeFillers}
              language={advancedOptions.fillerLanguage}
              onEnabledChange={(enabled) => updateAdvanced({ removeFillers: enabled })}
              onLanguageChange={(language) => updateAdvanced({ fillerLanguage: language })}
            />
          </div>

          <Separator />

          {/* Format & Platform */}
          <div className="space-y-3">
            <Label className="text-sm font-semibold">Format & Platform</Label>
            <FormatSelector
              outputFormat={advancedOptions.outputFormat}
              smartCrop={advancedOptions.smartCrop}
              targetPlatform={advancedOptions.targetPlatform}
              onOutputFormatChange={(format) => updateAdvanced({ outputFormat: format })}
              onSmartCropChange={(enabled) => updateAdvanced({ smartCrop: enabled })}
              onTargetPlatformChange={(platform) => updateAdvanced({ targetPlatform: platform })}
            />
          </div>
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
