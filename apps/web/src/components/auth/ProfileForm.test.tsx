import { describe, it, expect, vi } from "vitest"
import { render, screen } from "@testing-library/react"

vi.mock("@/lib/auth/actions", () => ({
  updateProfile: vi.fn(),
}))

import { ProfileForm } from "./ProfileForm"
import type { Profile } from "@/lib/auth/types"

const mockProfile: Profile = {
  id: "user-1",
  email: "test@example.com",
  full_name: "Test User",
  avatar_url: null,
  tier: "free",
  stripe_customer_id: null,
  stripe_subscription_id: null,
  subscription_status: "none",
  subscription_period_end: null,
  preferred_language: "it",
  created_at: "2026-03-01T00:00:00.000Z",
  updated_at: "2026-03-01T00:00:00.000Z",
}

describe("ProfileForm", () => {
  it("renders email as read-only info", () => {
    render(<ProfileForm profile={mockProfile} />)
    expect(screen.getByText("test@example.com")).toBeInTheDocument()
  })

  it("renders tier badge", () => {
    render(<ProfileForm profile={mockProfile} />)
    const badges = screen.getAllByText("FREE")
    expect(badges.length).toBeGreaterThanOrEqual(1)
  })

  it("renders full name input with default value", () => {
    render(<ProfileForm profile={mockProfile} />)
    const input = screen.getByLabelText(/full name/i) as HTMLInputElement
    expect(input.value).toBe("Test User")
  })

  it("renders save button", () => {
    render(<ProfileForm profile={mockProfile} />)
    const buttons = screen.getAllByRole("button", { name: /save changes/i })
    expect(buttons.length).toBeGreaterThanOrEqual(1)
  })

  it("renders language selector", () => {
    render(<ProfileForm profile={mockProfile} />)
    expect(screen.getByLabelText(/preferred language/i)).toBeInTheDocument()
  })
})
