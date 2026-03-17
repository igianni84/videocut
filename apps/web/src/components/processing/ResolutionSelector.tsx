"use client"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import {
  RESOLUTION_PRESETS,
  type OutputResolution,
} from "@/lib/processing/types"

type ResolutionSelectorProps = {
  resolution: OutputResolution
  onResolutionChange: (resolution: OutputResolution) => void
  tier: string
}

export function ResolutionSelector({
  resolution,
  onResolutionChange,
  tier,
}: ResolutionSelectorProps) {
  return (
    <div className="space-y-1.5">
      <Label>Output Resolution</Label>
      <div className="flex gap-1">
        {RESOLUTION_PRESETS.map((preset) => {
          const is4kLocked = preset.value === "4k" && tier === "free"

          return (
            <Button
              key={preset.value}
              type="button"
              size="sm"
              variant={resolution === preset.value ? "default" : "outline"}
              className="flex-1"
              disabled={is4kLocked}
              onClick={() => onResolutionChange(preset.value)}
            >
              {preset.label}
              {is4kLocked && (
                <Badge variant="secondary" className="ml-1 text-[10px] px-1 py-0">
                  Pro
                </Badge>
              )}
            </Button>
          )
        })}
      </div>
    </div>
  )
}
