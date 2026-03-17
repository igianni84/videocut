"use client"

import type { SubtitleOptions } from "@/lib/subtitles/types"
import { SAFE_ZONES, type OutputFormat, type TargetPlatform } from "@/lib/processing/types"

type SubtitlePreviewProps = {
  options: SubtitleOptions
  outputFormat?: OutputFormat
  targetPlatform?: TargetPlatform
}

const SAMPLE_WORDS = [
  { text: "Ciao", highlighted: false },
  { text: "oggi", highlighted: false },
  { text: "parliamo", highlighted: true },
  { text: "di", highlighted: false },
]

const ASPECT_CLASSES: Record<string, string> = {
  original: "aspect-video",
  "16:9": "aspect-video",
  "9:16": "aspect-[9/16]",
  "1:1": "aspect-square",
  "4:3": "aspect-[4/3]",
}

export function SubtitlePreview({
  options,
  outputFormat = "original",
  targetPlatform = "none",
}: SubtitlePreviewProps) {
  const positionClass = {
    top: "items-start pt-4",
    center: "items-center",
    bottom: "items-end pb-4",
  }[options.position]

  const aspectClass = ASPECT_CLASSES[outputFormat] ?? "aspect-video"

  // Scale font size down for the preview (video is ~300px wide vs 1920px)
  const scaleFactor = 300 / 1920
  const previewFontSize = Math.max(10, Math.round(options.size * scaleFactor))

  // Safe zone overlay
  const safeZone = targetPlatform !== "none" ? SAFE_ZONES[targetPlatform as keyof typeof SAFE_ZONES] : null
  // Scale safe zone values from reference 1920px height to preview
  const previewScale = 300 / 1920  // approximate preview height

  return (
    <div
      data-testid="subtitle-preview"
      className={`relative flex ${aspectClass} w-full justify-center rounded-lg bg-zinc-900 ${positionClass}`}
    >
      {/* Safe zone overlays */}
      {safeZone && outputFormat === "9:16" && (
        <>
          {safeZone.top > 0 && (
            <div
              className="absolute left-0 right-0 top-0 rounded-t-lg bg-red-500/20"
              style={{ height: `${safeZone.top * previewScale}px` }}
            />
          )}
          {safeZone.bottom > 0 && (
            <div
              className="absolute bottom-0 left-0 right-0 rounded-b-lg bg-red-500/20"
              style={{ height: `${safeZone.bottom * previewScale}px` }}
            />
          )}
          {safeZone.right > 0 && (
            <div
              className="absolute bottom-0 right-0 top-0 rounded-r-lg bg-red-500/20"
              style={{ width: `${safeZone.right * previewScale}px` }}
            />
          )}
        </>
      )}

      {options.enabled && (
        <p
          className="z-10 px-2 text-center"
          style={{
            fontFamily: options.font,
            fontSize: `${previewFontSize}px`,
            textShadow: options.shadow
              ? `${options.shadow}px ${options.shadow}px ${options.shadow * 2}px rgba(0,0,0,0.8)`
              : undefined,
            WebkitTextStroke: options.outline
              ? `${Math.max(0.5, options.outline * scaleFactor)}px black`
              : undefined,
          }}
        >
          {SAMPLE_WORDS.map((word, i) => (
            <span
              key={i}
              style={{
                color: word.highlighted
                  ? options.colorHighlight
                  : options.colorBase,
              }}
            >
              {word.text}
              {i < SAMPLE_WORDS.length - 1 ? " " : ""}
            </span>
          ))}
        </p>
      )}
    </div>
  )
}
