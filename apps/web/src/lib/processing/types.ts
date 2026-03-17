export const SPEED_MODES = ["none", "uniform", "smart"] as const
export type SpeedMode = (typeof SPEED_MODES)[number]

export const SPEED_PRESETS = [0.5, 0.75, 1, 1.25, 1.5, 2] as const

export const FORMAT_PRESETS = [
  { value: "original", label: "Original", ratio: null },
  { value: "16:9", label: "16:9", ratio: 16 / 9 },
  { value: "9:16", label: "9:16", ratio: 9 / 16 },
  { value: "1:1", label: "1:1", ratio: 1 },
  { value: "4:3", label: "4:3", ratio: 4 / 3 },
] as const
export type OutputFormat = (typeof FORMAT_PRESETS)[number]["value"]

export const PLATFORM_PRESETS = [
  { value: "none", label: "None" },
  { value: "tiktok", label: "TikTok" },
  { value: "reels", label: "Reels" },
  { value: "shorts", label: "Shorts" },
  { value: "youtube", label: "YouTube" },
] as const
export type TargetPlatform = (typeof PLATFORM_PRESETS)[number]["value"]

export const RESOLUTION_PRESETS = [
  { value: "720p", label: "720p" },
  { value: "1080p", label: "1080p (HD)" },
  { value: "4k", label: "4K" },
] as const
export type OutputResolution = (typeof RESOLUTION_PRESETS)[number]["value"]

export const SAFE_ZONES = {
  tiktok: { top: 150, bottom: 270, right: 100 },
  reels: { top: 210, bottom: 310, right: 100 },
  shorts: { top: 150, bottom: 280, right: 100 },
  youtube: { top: 0, bottom: 0, right: 0 },
} as const

export type AdvancedOptions = {
  speedMode: SpeedMode
  speedValue: number
  removeFillers: boolean
  fillerLanguage: string
  outputFormat: OutputFormat
  smartCrop: boolean
  targetPlatform: TargetPlatform
  outputResolution: OutputResolution
}

export const DEFAULT_ADVANCED_OPTIONS: AdvancedOptions = {
  speedMode: "none",
  speedValue: 1.0,
  removeFillers: false,
  fillerLanguage: "auto",
  outputFormat: "original",
  smartCrop: true,
  targetPlatform: "none",
  outputResolution: "1080p",
}
