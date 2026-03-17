import { describe, it, expect, afterEach } from "vitest"
import { render, cleanup, within } from "@testing-library/react"

import { JobStatusBadge } from "./JobStatusBadge"

afterEach(() => {
  cleanup()
})

describe("JobStatusBadge", () => {
  it("renders 'Queued' with outline variant", () => {
    const { container } = render(<JobStatusBadge status="queued" />)
    const badge = container.firstElementChild as HTMLElement
    expect(within(badge).getByText("Queued")).toBeInTheDocument()
    expect(badge.className).toContain("border-border")
  })

  it("renders 'Processing' with default variant", () => {
    const { container } = render(<JobStatusBadge status="processing" />)
    const badge = container.firstElementChild as HTMLElement
    expect(within(badge).getByText("Processing")).toBeInTheDocument()
    expect(badge.className).toContain("bg-primary")
  })

  it("shows progress percentage when processing", () => {
    const { container } = render(
      <JobStatusBadge status="processing" progress={42} />
    )
    const badge = container.firstElementChild as HTMLElement
    expect(within(badge).getByText("Processing")).toBeInTheDocument()
    expect(within(badge).getByText("42%")).toBeInTheDocument()
  })

  it("does not show progress when processing without progress prop", () => {
    const { container } = render(<JobStatusBadge status="processing" />)
    const badge = container.firstElementChild as HTMLElement
    expect(within(badge).getByText("Processing")).toBeInTheDocument()
    expect(within(badge).queryByText(/%/)).not.toBeInTheDocument()
  })

  it("does not show progress for non-processing statuses", () => {
    const { container } = render(
      <JobStatusBadge status="queued" progress={50} />
    )
    const badge = container.firstElementChild as HTMLElement
    expect(within(badge).getByText("Queued")).toBeInTheDocument()
    expect(within(badge).queryByText("50%")).not.toBeInTheDocument()
  })

  it("renders 'Completed' with secondary variant", () => {
    const { container } = render(<JobStatusBadge status="completed" />)
    const badge = container.firstElementChild as HTMLElement
    expect(within(badge).getByText("Completed")).toBeInTheDocument()
    expect(badge.className).toContain("bg-secondary")
  })

  it("renders 'Failed' with destructive variant", () => {
    const { container } = render(<JobStatusBadge status="failed" />)
    const badge = container.firstElementChild as HTMLElement
    expect(within(badge).getByText("Failed")).toBeInTheDocument()
    expect(badge.className).toContain("destructive")
  })
})
