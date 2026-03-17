import type { Database, Json } from "@/types/database.types"

export type Job = Database["public"]["Tables"]["jobs"]["Row"]
export type JobInsert = Database["public"]["Tables"]["jobs"]["Insert"]

export type JobStatus = Job["status"]

export type ProcessingOptionsPayload = {
  silence_threshold_ms?: number
  min_breath_pause_ms?: number
  subtitle_enabled?: boolean
  subtitle_font?: string
  subtitle_size?: number
  subtitle_color_base?: string
  subtitle_color_highlight?: string
  subtitle_position?: string
  subtitle_outline?: number
  subtitle_shadow?: number
  subtitle_language?: string
}

export type CreateJobPayload = {
  videoId: string
  options?: ProcessingOptionsPayload
}

export type CreateJobResponse = {
  id: string
  status: JobStatus
}
