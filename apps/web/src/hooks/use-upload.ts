"use client"

import { useCallback, useRef, useState } from "react"
import {
  validateFileType,
  validateFileSize,
  validateDuration,
} from "@/lib/videos/validation"
import type {
  Tier,
  UploadState,
  VideoMetadata,
  SignedUrlResponse,
  RegisterVideoPayload,
} from "@/lib/videos/types"

const INITIAL_STATE: UploadState = {
  phase: "idle",
  progress: 0,
  error: null,
}

function extractVideoMetadata(file: File): Promise<VideoMetadata> {
  return new Promise((resolve, reject) => {
    const video = document.createElement("video")
    video.preload = "metadata"

    video.onloadedmetadata = () => {
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
      URL.revokeObjectURL(video.src)
      reject(new Error("Failed to read video metadata. File may be corrupted."))
    }

    video.src = URL.createObjectURL(file)
  })
}

async function requestSignedUrl(
  contentType: string,
  fileSize: number
): Promise<SignedUrlResponse> {
  const res = await fetch("/api/upload/signed-url", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ contentType, fileSize }),
  })

  if (!res.ok) {
    const data = await res.json()
    throw new Error(data.error || "Failed to get upload URL")
  }

  return res.json()
}

function uploadToStorage(
  signedUrl: string,
  file: File,
  onProgress: (pct: number) => void,
  signal: AbortSignal
): Promise<void> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest()

    signal.addEventListener("abort", () => {
      xhr.abort()
    })

    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable) {
        onProgress(Math.round((e.loaded / e.total) * 100))
      }
    }

    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        resolve()
      } else {
        reject(new Error(`Upload failed with status ${xhr.status}`))
      }
    }

    xhr.onerror = () => reject(new Error("Upload failed. Check your connection."))
    xhr.onabort = () => reject(new Error("Upload cancelled"))

    xhr.open("PUT", signedUrl)
    xhr.setRequestHeader("Content-Type", file.type)
    xhr.send(file)
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

      const sizeError = validateFileSize(file.size)
      if (sizeError) throw new Error(sizeError)

      const metadata = await extractVideoMetadata(file)

      const durationError = validateDuration(metadata.duration, tier)
      if (durationError) throw new Error(durationError)

      if (signal.aborted) throw new Error("Upload cancelled")

      // Phase 2: Request signed URL
      setState({ phase: "requesting-url", progress: 0, error: null })

      const { signedUrl, storagePath } = await requestSignedUrl(
        file.type,
        file.size
      )

      if (signal.aborted) throw new Error("Upload cancelled")

      // Phase 3: Upload to storage
      setState({ phase: "uploading", progress: 0, error: null })

      await uploadToStorage(
        signedUrl,
        file,
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
