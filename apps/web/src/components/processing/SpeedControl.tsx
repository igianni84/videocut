"use client"

import { Label } from "@/components/ui/label"
import { Slider } from "@/components/ui/slider"
import { Button } from "@/components/ui/button"
import {
  SPEED_MODES,
  SPEED_PRESETS,
  type SpeedMode,
} from "@/lib/processing/types"

type SpeedControlProps = {
  speedMode: SpeedMode
  speedValue: number
  onSpeedModeChange: (mode: SpeedMode) => void
  onSpeedValueChange: (value: number) => void
}

const MODE_LABELS: Record<SpeedMode, string> = {
  none: "None",
  uniform: "Uniform",
  smart: "Smart",
}

export function SpeedControl({
  speedMode,
  speedValue,
  onSpeedModeChange,
  onSpeedValueChange,
}: SpeedControlProps) {
  return (
    <div className="space-y-3">
      {/* Mode selector */}
      <div className="space-y-1.5">
        <Label>Speed Mode</Label>
        <div className="flex gap-1">
          {SPEED_MODES.map((mode) => (
            <Button
              key={mode}
              type="button"
              size="sm"
              variant={speedMode === mode ? "default" : "outline"}
              className="flex-1 capitalize"
              onClick={() => onSpeedModeChange(mode)}
            >
              {MODE_LABELS[mode]}
            </Button>
          ))}
        </div>
      </div>

      {/* Speed slider — only for uniform */}
      {speedMode === "uniform" && (
        <div className="space-y-1.5">
          <div className="flex items-center justify-between">
            <Label>Speed</Label>
            <span className="text-xs text-muted-foreground">{speedValue}x</span>
          </div>
          <Slider
            min={0.5}
            max={2}
            step={0.25}
            value={[speedValue]}
            onValueChange={(v) => onSpeedValueChange(Array.isArray(v) ? v[0] : v)}
          />
          <div className="flex justify-between text-[10px] text-muted-foreground">
            {SPEED_PRESETS.map((p) => (
              <span key={p}>{p}x</span>
            ))}
          </div>
        </div>
      )}

      {/* Smart mode info */}
      {speedMode === "smart" && (
        <p className="text-xs text-muted-foreground">
          Non-speech gaps accelerated 2x
        </p>
      )}
    </div>
  )
}
