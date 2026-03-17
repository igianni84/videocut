import { describe, it, expect, afterEach, vi } from "vitest"
import { render, cleanup, fireEvent } from "@testing-library/react"

import { SubtitleCustomizer } from "./SubtitleCustomizer"
import { DEFAULT_SUBTITLE_OPTIONS } from "@/lib/subtitles/types"

afterEach(() => {
  cleanup()
})

describe("SubtitleCustomizer", () => {
  it("renders enable toggle", () => {
    const { getByText } = render(
      <SubtitleCustomizer value={DEFAULT_SUBTITLE_OPTIONS} onChange={vi.fn()} />
    )
    expect(getByText("Enable Subtitles")).toBeInTheDocument()
  })

  it("shows controls when enabled", () => {
    const { getByText } = render(
      <SubtitleCustomizer
        value={{ ...DEFAULT_SUBTITLE_OPTIONS, enabled: true }}
        onChange={vi.fn()}
      />
    )
    expect(getByText("Font")).toBeInTheDocument()
    expect(getByText("Size")).toBeInTheDocument()
    expect(getByText("Position")).toBeInTheDocument()
    expect(getByText("Language")).toBeInTheDocument()
  })

  it("hides controls when disabled", () => {
    const { queryByText } = render(
      <SubtitleCustomizer
        value={{ ...DEFAULT_SUBTITLE_OPTIONS, enabled: false }}
        onChange={vi.fn()}
      />
    )
    expect(queryByText("Font")).not.toBeInTheDocument()
    expect(queryByText("Size")).not.toBeInTheDocument()
  })

  it("shows position buttons", () => {
    const { getByText } = render(
      <SubtitleCustomizer value={DEFAULT_SUBTITLE_OPTIONS} onChange={vi.fn()} />
    )
    expect(getByText("top")).toBeInTheDocument()
    expect(getByText("center")).toBeInTheDocument()
    expect(getByText("bottom")).toBeInTheDocument()
  })

  it("calls onChange when position button clicked", () => {
    const onChange = vi.fn()
    const { getByText } = render(
      <SubtitleCustomizer value={DEFAULT_SUBTITLE_OPTIONS} onChange={onChange} />
    )
    fireEvent.click(getByText("top"))
    expect(onChange).toHaveBeenCalledWith(
      expect.objectContaining({ position: "top" })
    )
  })

  it("renders color inputs", () => {
    const { getByLabelText } = render(
      <SubtitleCustomizer value={DEFAULT_SUBTITLE_OPTIONS} onChange={vi.fn()} />
    )
    expect(getByLabelText("Base Color")).toBeInTheDocument()
    expect(getByLabelText("Highlight Color")).toBeInTheDocument()
  })

  it("renders size slider with value label", () => {
    const { getByText } = render(
      <SubtitleCustomizer value={DEFAULT_SUBTITLE_OPTIONS} onChange={vi.fn()} />
    )
    expect(getByText("48px")).toBeInTheDocument()
  })
})
