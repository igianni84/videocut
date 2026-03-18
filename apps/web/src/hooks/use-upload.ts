"use client"

import { useCallback, useRef, useState } from "react"
import {
  validateFileType,
  validateFileSize,
  validateDuration,
} from "@/lib/videos/validation"
import { createClient } from "@/lib/supabase/client"
import type {
  Tier,
  UploadState,
  VideoMetadata,
  PrepareUploadResponse,
  RegisterVideoPayload,
} from "@/lib/videos/types"

const INITIAL_STATE: UploadState = {
  phase: "idle",
  progress: 0,
  error: null,
}

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!

function extractVideoMetadata(file: File): Promise<VideoMetadata> {
  return new Promise((resolve, reject) => {
    const video = document.createElement("video")
    video.preload = "metadata"

    const timeout = setTimeout(() => {
      URL.revokeObjectURL(video.src)
      video.onloadedmetadata = null
      video.onerror = null
      reject(
        new Error(
          "Timed out reading video metadata. The file format may not be supported by your browser."
        )
      )
    }, 15_000)

    video.onloadedmetadata = () => {
      clearTimeout(timeout)
      URL.revokeObjectURL(video.src)
      if (!isFinite(video.duration) || video.duration <= 0) {
        reject(new Error("Could not determine video duration."))
        return
      }
      resolve({
        duration: video.duration,
        width: video.videoWidth,
        height: video.videoHeight,
      })
    }

    video.onerror = () => {
      clearTimeout(timeout)
      URL.revokeObjectURL(video.src)
      reject(new Error("Failed to read video metadata. File may be corrupted."))
    }

    video.src = URL.createObjectURL(file)
  })
}

async function requestUploadPath(
  contentType: string,
  fileSize: number
): Promise<PrepareUploadResponse> {
  const res = await fetch("/api/upload/signed-url", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ contentType, fileSize }),
  })

  if (!res.ok) {
    const data = await res.json()
    throw new Error(data.error || "Failed to prepare upload")
  }

  return res.json()
}

async function uploadWithTus(
  file: File,
  storagePath: string,
  accessToken: string,
  onProgress: (pct: number) => void,
  signal: AbortSignal
): Promise<void> {
  const tus = await import("tus-js-client")

  return new Promise((resolve, reject) => {
    let aborted = false

    const upload = new tus.Upload(file, {
      endpoint: `${SUPABASE_URL}/storage/v1/upload/resumable`,
      retryDelays: [0, 1000, 3000, 5000],
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "x-upsert": "true",
      },
      uploadDataDuringCreation: true,
      removeFingerprintOnSuccess: true,
      metadata: {
        bucketName: "originals",
        objectName: storagePath,
        contentType: file.type,
        cacheControl: "3600",
      },
      chunkSize: 6 * 1024 * 1024, // 6 MB chunks (Supabase recommended)
      onError: (error) => {
        if (!aborted) {
          reject(new Error(`Upload failed: ${error.message}`))
        }
      },
      onProgress: (bytesUploaded, bytesTotal) => {
        onProgress(Math.round((bytesUploaded / bytesTotal) * 100))
      },
      onSuccess: () => {
        resolve()
      },
    })

    signal.addEventListener("abort", () => {
      aborted = true
      upload.abort(true)
      reject(new Error("Upload cancelled"))
    })

    upload
      .findPreviousUploads()
      .then((previousUploads) => {
        if (previousUploads.length > 0) {
          upload.resumeFromPreviousUpload(previousUploads[0])
        }
        upload.start()
      })
      .catch(() => {
        // Fingerprint storage unavailable — start fresh upload
        upload.start()
      })
  })
}

async function registerVideo(
  payload: RegisterVideoPayload
): Promise<{ id: string }> {
  const res = await fetch("/api/videos", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  })

  if (!res.ok) {
    const data = await res.json()
    throw new Error(data.error || "Failed to register video")
  }

  return res.json()
}

export function useUpload() {
  const [state, setState] = useState<UploadState>(INITIAL_STATE)
  const abortRef = useRef<AbortController | null>(null)

  const upload = useCallback(async (file: File, tier: Tier) => {
    abortRef.current = new AbortController()
    const { signal } = abortRef.current

    try {
      // Phase 1: Validate
      setState({ phase: "validating", progress: 0, error: null })

      const typeError = validateFileType(file.type)
      if (typeError) throw new Error(typeError)

      const sizeError = validateFileSize(file.size, tier)
      if (sizeError) throw new Error(sizeError)

      const metadata = await extractVideoMetadata(file)

      const durationError = validateDuration(metadata.duration, tier)
      if (durationError) throw new Error(durationError)

      if (signal.aborted) throw new Error("Upload cancelled")

      // Phase 2: Prepare upload (server validates + generates path)
      setState({ phase: "requesting-url", progress: 0, error: null })

      const { storagePath } = await requestUploadPath(file.type, file.size)

      // Get session token for TUS auth
      const supabase = createClient()
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) throw new Error("Session expired. Please log in again.")

      if (signal.aborted) throw new Error("Upload cancelled")

      // Phase 3: Upload via TUS (resumable, chunked)
      setState({ phase: "uploading", progress: 0, error: null })

      await uploadWithTus(
        file,
        storagePath,
        session.access_token,
        (pct) => setState({ phase: "uploading", progress: pct, error: null }),
        signal
      )

      if (signal.aborted) throw new Error("Upload cancelled")

      // Phase 4: Register in DB
      setState({ phase: "registering", progress: 100, error: null })

      const result = await registerVideo({
        storagePath,
        originalFilename: file.name,
        mimeType: file.type,
        fileSize: file.size,
        durationSeconds: metadata.duration,
        width: metadata.width || null,
        height: metadata.height || null,
      })

      setState({ phase: "complete", progress: 100, error: null })
      return result
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Upload failed"
      setState({ phase: "error", progress: 0, error: message })
      return null
    } finally {
      abortRef.current = null
    }
  }, [])

  const cancel = useCallback(() => {
    abortRef.current?.abort()
    setState(INITIAL_STATE)
  }, [])

  const reset = useCallback(() => {
    abortRef.current?.abort()
    setState(INITIAL_STATE)
  }, [])

  return { state, upload, cancel, reset }
}
