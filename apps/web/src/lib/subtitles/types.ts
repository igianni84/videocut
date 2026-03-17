export const SUBTITLE_FONTS = [
  "Montserrat",
  "Inter",
  "Roboto",
  "Arial",
  "Georgia",
] as const
export type SubtitleFont = (typeof SUBTITLE_FONTS)[number]

export const SUBTITLE_POSITIONS = ["top", "center", "bottom"] as const
export type SubtitlePosition = (typeof SUBTITLE_POSITIONS)[number]

export const SUBTITLE_LANGUAGES = [
  { code: "auto", label: "Auto-detect" },
  { code: "it", label: "Italiano" },
  { code: "en", label: "English" },
  { code: "es", label: "Espanol" },
  { code: "fr", label: "Francais" },
  { code: "de", label: "Deutsch" },
  { code: "pt", label: "Portugues" },
] as const

export type SubtitleOptions = {
  enabled: boolean
  font: SubtitleFont
  size: number
  colorBase: string
  colorHighlight: string
  position: SubtitlePosition
  outline: number
  shadow: number
  language: string
}

export const DEFAULT_SUBTITLE_OPTIONS: SubtitleOptions = {
  enabled: true,
  font: "Montserrat",
  size: 48,
  colorBase: "#FFFFFF",
  colorHighlight: "#FFFF00",
  position: "bottom",
  outline: 2,
  shadow: 1,
  language: "auto",
}
