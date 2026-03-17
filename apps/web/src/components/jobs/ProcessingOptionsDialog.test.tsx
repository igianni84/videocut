import { describe, it, expect, afterEach, vi } from "vitest"
import { render, cleanup, fireEvent } from "@testing-library/react"

import { ProcessingOptionsDialog } from "./ProcessingOptionsDialog"

afterEach(() => {
  cleanup()
})

describe("ProcessingOptionsDialog", () => {
  it("renders the trigger button", () => {
    const { getByText } = render(
      <ProcessingOptionsDialog videoId="vid-1" />
    )
    expect(getByText("Process")).toBeInTheDocument()
  })

  it("trigger button is disabled when disabled prop is true", () => {
    const { getByText } = render(
      <ProcessingOptionsDialog videoId="vid-1" disabled={true} />
    )
    const button = getByText("Process").closest("button")!
    expect(button).toBeDisabled()
  })

  it("opens dialog on trigger click", () => {
    const { getByText } = render(
      <ProcessingOptionsDialog videoId="vid-1" />
    )
    fireEvent.click(getByText("Process"))
    expect(getByText("Processing Options")).toBeInTheDocument()
    expect(getByText("Start Processing")).toBeInTheDocument()
  })

  it("shows subtitle customizer in dialog", () => {
    const { getByText, getAllByText } = render(
      <ProcessingOptionsDialog videoId="vid-1" />
    )
    fireEvent.click(getByText("Process"))
    expect(getByText("Enable Subtitles")).toBeInTheDocument()
  })

  it("shows resolution selector when dialog is opened", () => {
    const { getByText } = render(
      <ProcessingOptionsDialog videoId="vid-1" />
    )
    fireEvent.click(getByText("Process"))
    expect(getByText("Output Resolution")).toBeInTheDocument()
  })

  it("shows Resolution label in dialog", () => {
    const { getByText } = render(
      <ProcessingOptionsDialog videoId="vid-1" />
    )
    fireEvent.click(getByText("Process"))
    expect(getByText("Resolution")).toBeInTheDocument()
  })

  it("submits with options and calls onProcessStarted", async () => {
    const onProcessStarted = vi.fn()
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ id: "job-123", status: "queued" }),
    })
    globalThis.fetch = mockFetch

    const { getByText } = render(
      <ProcessingOptionsDialog
        videoId="vid-1"
        onProcessStarted={onProcessStarted}
      />
    )

    // Open dialog
    fireEvent.click(getByText("Process"))

    // Click start processing
    fireEvent.click(getByText("Start Processing"))

    // Wait for async operations
    await vi.waitFor(() => {
      expect(mockFetch).toHaveBeenCalledWith("/api/jobs", expect.objectContaining({
        method: "POST",
      }))
    })

    await vi.waitFor(() => {
      expect(onProcessStarted).toHaveBeenCalledWith("job-123")
    })
  })
})
