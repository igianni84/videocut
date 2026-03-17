"use client"

import type { SubtitleOptions } from "@/lib/subtitles/types"

type SubtitlePreviewProps = {
  options: SubtitleOptions
}

const SAMPLE_WORDS = [
  { text: "Ciao", highlighted: false },
  { text: "oggi", highlighted: false },
  { text: "parliamo", highlighted: true },
  { text: "di", highlighted: false },
]

export function SubtitlePreview({ options }: SubtitlePreviewProps) {
  const positionClass = {
    top: "items-start pt-4",
    center: "items-center",
    bottom: "items-end pb-4",
  }[options.position]

  // Scale font size down for the preview (video is ~300px wide vs 1920px)
  const scaleFactor = 300 / 1920
  const previewFontSize = Math.max(10, Math.round(options.size * scaleFactor))

  return (
    <div
      data-testid="subtitle-preview"
      className={`flex aspect-video w-full justify-center rounded-lg bg-zinc-900 ${positionClass}`}
    >
      {options.enabled && (
        <p
          className="px-2 text-center"
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
