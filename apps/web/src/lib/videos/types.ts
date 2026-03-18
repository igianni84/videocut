import type { Database } from "@/types/database.types"

export type Video = Database["public"]["Tables"]["videos"]["Row"]
export type VideoInsert = Database["public"]["Tables"]["videos"]["Insert"]

export type VideoStatus = Video["status"]
export type Tier = Database["public"]["Tables"]["profiles"]["Row"]["tier"]

export type UploadPhase =
  | "idle"
  | "validating"
  | "requesting-url"
  | "uploading"
  | "registering"
  | "complete"
  | "error"

export type UploadState = {
  phase: UploadPhase
  progress: number
  error: string | null
}

export type VideoMetadata = {
  duration: number
  width: number
  height: number
}

export type PrepareUploadResponse = {
  storagePath: string
}

export type RegisterVideoPayload = {
  storagePath: string
  originalFilename: string
  mimeType: string
  fileSize: number
  durationSeconds: number
  width: number | null
  height: number | null
}
