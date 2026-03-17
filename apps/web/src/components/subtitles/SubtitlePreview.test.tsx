import { describe, it, expect, afterEach } from "vitest"
import { render, cleanup } from "@testing-library/react"

import { SubtitlePreview } from "./SubtitlePreview"
import { DEFAULT_SUBTITLE_OPTIONS } from "@/lib/subtitles/types"

afterEach(() => {
  cleanup()
})

describe("SubtitlePreview", () => {
  it("renders the preview container", () => {
    const { getByTestId } = render(
      <SubtitlePreview options={DEFAULT_SUBTITLE_OPTIONS} />
    )
    expect(getByTestId("subtitle-preview")).toBeInTheDocument()
  })

  it("shows sample text when enabled", () => {
    const { getByText } = render(
      <SubtitlePreview options={{ ...DEFAULT_SUBTITLE_OPTIONS, enabled: true }} />
    )
    expect(getByText("parliamo")).toBeInTheDocument()
  })

  it("hides text when disabled", () => {
    const { queryByText } = render(
      <SubtitlePreview options={{ ...DEFAULT_SUBTITLE_OPTIONS, enabled: false }} />
    )
    expect(queryByText("parliamo")).not.toBeInTheDocument()
  })

  it("applies font family from options", () => {
    const { getByText } = render(
      <SubtitlePreview options={{ ...DEFAULT_SUBTITLE_OPTIONS, font: "Inter" }} />
    )
    const el = getByText("parliamo").parentElement!
    expect(el.style.fontFamily).toBe("Inter")
  })

  it("applies highlight color to highlighted word", () => {
    const { getByText } = render(
      <SubtitlePreview
        options={{ ...DEFAULT_SUBTITLE_OPTIONS, colorHighlight: "#FF0000" }}
      />
    )
    // "parliamo" is the highlighted word
    const el = getByText("parliamo")
    expect(el.style.color).toBe("rgb(255, 0, 0)")
  })

  it("applies base color to non-highlighted words", () => {
    const { getByText } = render(
      <SubtitlePreview
        options={{ ...DEFAULT_SUBTITLE_OPTIONS, colorBase: "#00FF00" }}
      />
    )
    const el = getByText(/^Ciao/)
    expect(el.style.color).toBe("rgb(0, 255, 0)")
  })
})
