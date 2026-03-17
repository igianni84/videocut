import { describe, it, expect, afterEach, vi } from "vitest"
import { render, cleanup, fireEvent } from "@testing-library/react"

import { ResolutionSelector } from "./ResolutionSelector"

afterEach(() => {
  cleanup()
})

describe("ResolutionSelector", () => {
  it("renders all three resolution options", () => {
    const { getByText } = render(
      <ResolutionSelector
        resolution="1080p"
        onResolutionChange={vi.fn()}
        tier="free"
      />
    )
    expect(getByText("720p")).toBeInTheDocument()
    expect(getByText("1080p (HD)")).toBeInTheDocument()
    expect(getByText(/4K/)).toBeInTheDocument()
  })

  it("4K is disabled when tier is free", () => {
    const { getByText } = render(
      <ResolutionSelector
        resolution="1080p"
        onResolutionChange={vi.fn()}
        tier="free"
      />
    )
    const button4k = getByText(/4K/).closest("button")!
    expect(button4k).toBeDisabled()
  })

  it("shows Pro badge on disabled 4K", () => {
    const { getByText } = render(
      <ResolutionSelector
        resolution="1080p"
        onResolutionChange={vi.fn()}
        tier="free"
      />
    )
    expect(getByText("Pro")).toBeInTheDocument()
  })

  it("4K is enabled when tier is pro", () => {
    const { getByText, queryByText } = render(
      <ResolutionSelector
        resolution="1080p"
        onResolutionChange={vi.fn()}
        tier="pro"
      />
    )
    const button4k = getByText("4K").closest("button")!
    expect(button4k).not.toBeDisabled()
    expect(queryByText("Pro")).not.toBeInTheDocument()
  })

  it("calls onResolutionChange when clicked", () => {
    const onChange = vi.fn()
    const { getByText } = render(
      <ResolutionSelector
        resolution="1080p"
        onResolutionChange={onChange}
        tier="pro"
      />
    )
    fireEvent.click(getByText("720p"))
    expect(onChange).toHaveBeenCalledWith("720p")
  })

  it("renders Output Resolution label", () => {
    const { getByText } = render(
      <ResolutionSelector
        resolution="1080p"
        onResolutionChange={vi.fn()}
        tier="free"
      />
    )
    expect(getByText("Output Resolution")).toBeInTheDocument()
  })
})
