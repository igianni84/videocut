import type { Tier } from "./types"

export const ACCEPTED_MIME_TYPES = [
  "video/mp4",
  "video/quicktime",
  "video/webm",
] as const

export const MAX_FILE_SIZE_BYTES = 500 * 1024 * 1024 // 500 MB

export const DURATION_LIMITS: Record<Tier, number> = {
  free: 60,
  pro: 180,
}

const MIME_TO_EXTENSION: Record<string, string> = {
  "video/mp4": ".mp4",
  "video/quicktime": ".mov",
  "video/webm": ".webm",
}

export function validateFileType(mimeType: string): string | null {
  if (!ACCEPTED_MIME_TYPES.includes(mimeType as (typeof ACCEPTED_MIME_TYPES)[number])) {
    return `File type "${mimeType}" is not supported. Accepted: MP4, MOV, WebM.`
  }
  return null
}

export function validateFileSize(sizeBytes: number): string | null {
  if (sizeBytes <= 0) {
    return "File is empty."
  }
  if (sizeBytes > MAX_FILE_SIZE_BYTES) {
    const maxMB = MAX_FILE_SIZE_BYTES / (1024 * 1024)
    return `File is too large. Maximum size is ${maxMB} MB.`
  }
  return null
}

export function validateDuration(
  durationSeconds: number,
  tier: Tier
): string | null {
  const limit = DURATION_LIMITS[tier]
  if (durationSeconds > limit) {
    return `Video duration (${Math.ceil(durationSeconds)}s) exceeds the ${tier} tier limit of ${limit}s.`
  }
  return null
}

export function getExtensionFromMime(mimeType: string): string {
  return MIME_TO_EXTENSION[mimeType] ?? ".mp4"
}

export function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  if (bytes < 1024 * 1024 * 1024)
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`
}

export function formatDuration(seconds: number): string {
  const m = Math.floor(seconds / 60)
  const s = Math.floor(seconds % 60)
  return `${m}:${s.toString().padStart(2, "0")}`
}
