"use client"

import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"
import { Button } from "@/components/ui/button"
import {
  FORMAT_PRESETS,
  PLATFORM_PRESETS,
  type OutputFormat,
  type TargetPlatform,
} from "@/lib/processing/types"

type FormatSelectorProps = {
  outputFormat: OutputFormat
  smartCrop: boolean
  targetPlatform: TargetPlatform
  onOutputFormatChange: (format: OutputFormat) => void
  onSmartCropChange: (enabled: boolean) => void
  onTargetPlatformChange: (platform: TargetPlatform) => void
}

export function FormatSelector({
  outputFormat,
  smartCrop,
  targetPlatform,
  onOutputFormatChange,
  onSmartCropChange,
  onTargetPlatformChange,
}: FormatSelectorProps) {
  const showSmartCrop = outputFormat !== "original"
  const showPlatform = outputFormat === "9:16"

  return (
    <div className="space-y-3">
      {/* Format buttons */}
      <div className="space-y-1.5">
        <Label>Output Format</Label>
        <div className="flex gap-1">
          {FORMAT_PRESETS.map((preset) => (
            <Button
              key={preset.value}
              type="button"
              size="sm"
              variant={outputFormat === preset.value ? "default" : "outline"}
              className="flex-1"
              onClick={() => onOutputFormatChange(preset.value as OutputFormat)}
            >
              {preset.label}
            </Button>
          ))}
        </div>
      </div>

      {/* Smart crop toggle */}
      {showSmartCrop && (
        <div className="flex items-center justify-between">
          <Label htmlFor="smart-crop-toggle">Smart Crop (face tracking)</Label>
          <Switch
            id="smart-crop-toggle"
            checked={smartCrop}
            onCheckedChange={onSmartCropChange}
          />
        </div>
      )}

      {/* Platform selector — only for 9:16 */}
      {showPlatform && (
        <div className="space-y-1.5">
          <Label>Target Platform</Label>
          <div className="flex gap-1">
            {PLATFORM_PRESETS.map((p) => (
              <Button
                key={p.value}
                type="button"
                size="sm"
                variant={targetPlatform === p.value ? "default" : "outline"}
                className="flex-1 text-xs"
                onClick={() => onTargetPlatformChange(p.value as TargetPlatform)}
              >
                {p.label}
              </Button>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
