"use client"

import { Label } from "@/components/ui/label"
import { Slider } from "@/components/ui/slider"
import { Switch } from "@/components/ui/switch"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Button } from "@/components/ui/button"
import {
  SUBTITLE_FONTS,
  SUBTITLE_LANGUAGES,
  SUBTITLE_POSITIONS,
  type SubtitleOptions,
  type SubtitleFont,
  type SubtitlePosition,
} from "@/lib/subtitles/types"

type SubtitleCustomizerProps = {
  value: SubtitleOptions
  onChange: (opts: SubtitleOptions) => void
}

export function SubtitleCustomizer({ value, onChange }: SubtitleCustomizerProps) {
  const update = (partial: Partial<SubtitleOptions>) => {
    onChange({ ...value, ...partial })
  }

  return (
    <div className="space-y-4">
      {/* Enable/disable */}
      <div className="flex items-center justify-between">
        <Label htmlFor="subtitle-toggle">Enable Subtitles</Label>
        <Switch
          id="subtitle-toggle"
          checked={value.enabled}
          onCheckedChange={(checked: boolean) => update({ enabled: checked })}
        />
      </div>

      {!value.enabled ? null : (
        <>
          {/* Font */}
          <div className="space-y-1.5">
            <Label>Font</Label>
            <Select
              value={value.font}
              onValueChange={(v: string) => update({ font: v as SubtitleFont })}
            >
              <SelectTrigger className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {SUBTITLE_FONTS.map((font) => (
                  <SelectItem key={font} value={font}>
                    {font}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Colors */}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="color-base">Base Color</Label>
              <input
                id="color-base"
                type="color"
                value={value.colorBase}
                onChange={(e) => update({ colorBase: e.target.value })}
                className="h-8 w-full cursor-pointer rounded border border-input"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="color-highlight">Highlight Color</Label>
              <input
                id="color-highlight"
                type="color"
                value={value.colorHighlight}
                onChange={(e) => update({ colorHighlight: e.target.value })}
                className="h-8 w-full cursor-pointer rounded border border-input"
              />
            </div>
          </div>

          {/* Size */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <Label>Size</Label>
              <span className="text-xs text-muted-foreground">{value.size}px</span>
            </div>
            <Slider
              min={24}
              max={72}
              value={[value.size]}
              onValueChange={(v: number[]) => update({ size: v[0] })}
            />
          </div>

          {/* Position */}
          <div className="space-y-1.5">
            <Label>Position</Label>
            <div className="flex gap-1">
              {SUBTITLE_POSITIONS.map((pos) => (
                <Button
                  key={pos}
                  type="button"
                  size="sm"
                  variant={value.position === pos ? "default" : "outline"}
                  className="flex-1 capitalize"
                  onClick={() => update({ position: pos as SubtitlePosition })}
                >
                  {pos}
                </Button>
              ))}
            </div>
          </div>

          {/* Outline */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <Label>Outline</Label>
              <span className="text-xs text-muted-foreground">{value.outline}</span>
            </div>
            <Slider
              min={0}
              max={4}
              value={[value.outline]}
              onValueChange={(v: number[]) => update({ outline: v[0] })}
            />
          </div>

          {/* Shadow */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <Label>Shadow</Label>
              <span className="text-xs text-muted-foreground">{value.shadow}</span>
            </div>
            <Slider
              min={0}
              max={2}
              value={[value.shadow]}
              onValueChange={(v: number[]) => update({ shadow: v[0] })}
            />
          </div>

          {/* Language */}
          <div className="space-y-1.5">
            <Label>Language</Label>
            <Select
              value={value.language}
              onValueChange={(v: string) => update({ language: v })}
            >
              <SelectTrigger className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {SUBTITLE_LANGUAGES.map((lang) => (
                  <SelectItem key={lang.code} value={lang.code}>
                    {lang.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </>
      )}
    </div>
  )
}
