import { describe, it, expect, vi } from "vitest"
import { render, screen } from "@testing-library/react"

vi.mock("@/lib/auth/actions", () => ({
  signInWithMagicLink: vi.fn(),
  signInWithOAuth: vi.fn(),
}))

import { LoginForm } from "./LoginForm"

describe("LoginForm", () => {
  it("renders email input", () => {
    render(<LoginForm />)
    expect(screen.getByLabelText(/email/i)).toBeInTheDocument()
  })

  it("renders magic link submit button", () => {
    render(<LoginForm />)
    const buttons = screen.getAllByRole("button", { name: /send magic link/i })
    expect(buttons.length).toBeGreaterThanOrEqual(1)
  })

  it("renders Google OAuth button", () => {
    render(<LoginForm />)
    const buttons = screen.getAllByRole("button", { name: /google/i })
    expect(buttons.length).toBeGreaterThanOrEqual(1)
  })

  it("renders Apple OAuth button", () => {
    render(<LoginForm />)
    const buttons = screen.getAllByRole("button", { name: /apple/i })
    expect(buttons.length).toBeGreaterThanOrEqual(1)
  })
})
