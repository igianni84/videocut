"use client"

import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { SUBTITLE_LANGUAGES } from "@/lib/subtitles/types"

type FillerRemovalProps = {
  enabled: boolean
  language: string
  onEnabledChange: (enabled: boolean) => void
  onLanguageChange: (language: string) => void
}

export function FillerRemoval({
  enabled,
  language,
  onEnabledChange,
  onLanguageChange,
}: FillerRemovalProps) {
  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <Label htmlFor="filler-toggle">Remove Filler Words</Label>
        <Switch
          id="filler-toggle"
          checked={enabled}
          onCheckedChange={onEnabledChange}
        />
      </div>

      {enabled && (
        <div className="space-y-1.5">
          <Label>Filler Language</Label>
          <Select value={language} onValueChange={(v) => { if (v) onLanguageChange(v) }}>
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
      )}
    </div>
  )
}
