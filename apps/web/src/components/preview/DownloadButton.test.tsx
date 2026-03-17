import { describe, it, expect, afterEach, vi } from "vitest"
import { render, cleanup, fireEvent } from "@testing-library/react"

import { DownloadButton } from "./DownloadButton"

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
})

describe("DownloadButton", () => {
  it("renders Download text", () => {
    const { getByText } = render(
      <DownloadButton videoId="vid-1" filename="output.mp4" />
    )
    expect(getByText("Download")).toBeInTheDocument()
  })

  it("shows loading state when downloading", async () => {
    // Use a promise that never resolves to keep button in loading state
    let resolveFetch: (value: unknown) => void
    const fetchPromise = new Promise((resolve) => {
      resolveFetch = resolve
    })
    const mockFetch = vi.fn().mockReturnValue(fetchPromise)
    globalThis.fetch = mockFetch

    const { getByText, container } = render(
      <DownloadButton videoId="vid-1" filename="output.mp4" />
    )

    fireEvent.click(getByText("Download"))

    await vi.waitFor(() => {
      const button = container.querySelector("button")!
      expect(button).toBeDisabled()
    })

    // Resolve to clean up
    resolveFetch!({
      ok: true,
      json: () => Promise.resolve({ downloadUrl: "https://example.com/file.mp4" }),
    })
  })

  it("calls fetch to download API", async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () =>
        Promise.resolve({
          downloadUrl: "https://example.com/processed.mp4",
          filename: "video_processed.mp4",
        }),
    })
    globalThis.fetch = mockFetch

    // Render first, then set up DOM mocks so render() is not affected
    const { getByText } = render(
      <DownloadButton videoId="vid-1" filename="output.mp4" />
    )

    // Mock anchor element creation after render to avoid breaking DOM
    const mockClick = vi.fn()
    const mockAnchor = { href: "", download: "", click: mockClick }
    const originalCreateElement = document.createElement.bind(document)
    vi.spyOn(document, "createElement").mockImplementation((tag: string) => {
      if (tag === "a") return mockAnchor as unknown as HTMLAnchorElement
      return originalCreateElement(tag)
    })
    vi.spyOn(document.body, "appendChild").mockImplementation(
      (node) => node
    )
    vi.spyOn(document.body, "removeChild").mockImplementation(
      (node) => node
    )

    fireEvent.click(getByText("Download"))

    await vi.waitFor(() => {
      expect(mockFetch).toHaveBeenCalledWith("/api/videos/vid-1/download")
    })
  })

  it("creates temporary anchor for download", async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () =>
        Promise.resolve({
          downloadUrl: "https://example.com/processed.mp4",
          filename: "video_processed.mp4",
        }),
    })
    globalThis.fetch = mockFetch

    // Render first, then set up DOM mocks
    const { getByText } = render(
      <DownloadButton videoId="vid-1" filename="output.mp4" />
    )

    const mockClick = vi.fn()
    const mockAnchor = { href: "", download: "", click: mockClick }
    const originalCreateElement = document.createElement.bind(document)
    vi.spyOn(document, "createElement").mockImplementation((tag: string) => {
      if (tag === "a") return mockAnchor as unknown as HTMLAnchorElement
      return originalCreateElement(tag)
    })
    const appendSpy = vi.spyOn(document.body, "appendChild").mockImplementation(
      (node) => node
    )
    const removeSpy = vi.spyOn(document.body, "removeChild").mockImplementation(
      (node) => node
    )

    fireEvent.click(getByText("Download"))

    await vi.waitFor(() => {
      expect(mockClick).toHaveBeenCalledOnce()
    })

    expect(mockAnchor.href).toBe("https://example.com/processed.mp4")
    expect(mockAnchor.download).toBe("video_processed.mp4")
    expect(appendSpy).toHaveBeenCalled()
    expect(removeSpy).toHaveBeenCalled()
  })
})
