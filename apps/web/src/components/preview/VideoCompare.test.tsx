import { describe, it, expect, afterEach, vi, beforeEach } from "vitest"
import { render, cleanup, fireEvent } from "@testing-library/react"

import { VideoCompare } from "./VideoCompare"
import type { Video } from "@/lib/videos/types"
import type { Job } from "@/lib/jobs/types"

afterEach(() => {
  cleanup()
})

const mockVideo: Video = {
  id: "vid-1",
  user_id: "user-1",
  original_filename: "my-video.mp4",
  storage_path: "uploads/vid-1.mp4",
  mime_type: "video/mp4",
  file_size_bytes: 50_000_000,
  duration_seconds: 120,
  width: 1920,
  height: 1080,
  status: "completed",
  created_at: "2026-03-17T00:00:00Z",
  updated_at: "2026-03-17T00:00:00Z",
}

const mockJob: Job = {
  id: "job-1",
  user_id: "user-1",
  video_id: "vid-1",
  status: "completed",
  options: {},
  retry_count: 0,
  progress: 100,
  output_duration_seconds: 90,
  output_width: 1920,
  output_height: 1080,
  output_storage_path: "processed/vid-1.mp4",
  processing_duration_ms: 45000,
  transcription: null,
  error_message: null,
  queued_at: "2026-03-17T00:00:00Z",
  started_at: "2026-03-17T00:01:00Z",
  completed_at: "2026-03-17T00:01:45Z",
  created_at: "2026-03-17T00:00:00Z",
  updated_at: "2026-03-17T00:01:45Z",
}

describe("VideoCompare", () => {
  beforeEach(() => {
    // Mock fetch for URL loading in useEffect
    const mockFetch = vi.fn().mockImplementation((url: string) => {
      if (url.includes("signed-url")) {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({ signedUrl: "https://example.com/original.mp4" }),
        })
      }
      if (url.includes("download")) {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({ downloadUrl: "https://example.com/processed.mp4" }),
        })
      }
      return Promise.resolve({ ok: false })
    })
    globalThis.fetch = mockFetch
  })

  it("renders Original and Processed tab buttons", () => {
    const { getByText } = render(
      <VideoCompare video={mockVideo} job={mockJob} onClose={vi.fn()} />
    )
    expect(getByText("Original")).toBeInTheDocument()
    expect(getByText("Processed")).toBeInTheDocument()
  })

  it("default active tab is Processed", () => {
    const { getByText } = render(
      <VideoCompare video={mockVideo} job={mockJob} onClose={vi.fn()} />
    )
    // The Processed button has "default" variant (bg-primary), Original has "outline" variant (bg-background)
    const processedBtn = getByText("Processed").closest("button")!
    const originalBtn = getByText("Original").closest("button")!
    expect(processedBtn.className).toContain("bg-primary")
    expect(originalBtn.className).toContain("bg-background")
  })

  it("clicking Original switches to that tab", () => {
    const { getByText } = render(
      <VideoCompare video={mockVideo} job={mockJob} onClose={vi.fn()} />
    )
    fireEvent.click(getByText("Original"))
    // After clicking, Original becomes active (bg-primary), Processed becomes outline (bg-background)
    const originalBtn = getByText("Original").closest("button")!
    const processedBtn = getByText("Processed").closest("button")!
    expect(originalBtn.className).toContain("bg-primary")
    expect(processedBtn.className).toContain("bg-background")
  })

  it("shows Loading... initially", () => {
    const { getByText } = render(
      <VideoCompare video={mockVideo} job={mockJob} onClose={vi.fn()} />
    )
    expect(getByText("Loading...")).toBeInTheDocument()
  })

  it("shows video metadata for processed view", async () => {
    const { getByText } = render(
      <VideoCompare video={mockVideo} job={mockJob} onClose={vi.fn()} />
    )
    // Wait for loading to finish and metadata to appear
    await vi.waitFor(() => {
      expect(getByText(/Duration: 90s/)).toBeInTheDocument()
    })
    expect(getByText(/25% shorter/)).toBeInTheDocument()
    expect(getByText(/Processed in 45\.0s/)).toBeInTheDocument()
  })

  it("calls onClose when X button clicked", () => {
    const onClose = vi.fn()
    const { container } = render(
      <VideoCompare video={mockVideo} job={mockJob} onClose={onClose} />
    )
    // The close button is the icon-sized button (h-8 w-8) that is not "Original" or "Processed"
    const buttons = container.querySelectorAll("button")
    const closeBtn = Array.from(buttons).find(
      (btn) => btn.textContent !== "Original" && btn.textContent !== "Processed"
    )
    expect(closeBtn).toBeDefined()
    fireEvent.click(closeBtn!)
    expect(onClose).toHaveBeenCalledOnce()
  })
})
