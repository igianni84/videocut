import { describe, it, expect, vi, beforeEach } from "vitest"
import { NextRequest } from "next/server"

const mockGetUser = vi.fn()

vi.mock("@supabase/ssr", () => ({
  createServerClient: vi.fn(() => ({
    auth: { getUser: mockGetUser },
  })),
}))

import { updateSession } from "./middleware"

function createRequest(pathname: string) {
  return new NextRequest(new URL(`http://localhost:3000${pathname}`))
}

describe("middleware — updateSession", () => {
  beforeEach(() => vi.clearAllMocks())

  it("allows unauthenticated access to /", async () => {
    mockGetUser.mockResolvedValue({ data: { user: null } })
    const response = await updateSession(createRequest("/"))
    expect(response.headers.get("location")).toBeNull()
  })

  it("allows unauthenticated access to /login", async () => {
    mockGetUser.mockResolvedValue({ data: { user: null } })
    const response = await updateSession(createRequest("/login"))
    expect(response.headers.get("location")).toBeNull()
  })

  it("allows unauthenticated access to /auth/callback", async () => {
    mockGetUser.mockResolvedValue({ data: { user: null } })
    const response = await updateSession(createRequest("/auth/callback"))
    expect(response.headers.get("location")).toBeNull()
  })

  it("redirects unauthenticated user from /dashboard to /login", async () => {
    mockGetUser.mockResolvedValue({ data: { user: null } })
    const response = await updateSession(createRequest("/dashboard"))
    const location = response.headers.get("location")
    expect(location).toContain("/login")
    expect(location).toContain("next=%2Fdashboard")
  })

  it("redirects unauthenticated user from /profile to /login", async () => {
    mockGetUser.mockResolvedValue({ data: { user: null } })
    const response = await updateSession(createRequest("/profile"))
    const location = response.headers.get("location")
    expect(location).toContain("/login")
    expect(location).toContain("next=%2Fprofile")
  })

  it("redirects authenticated user from /login to /dashboard", async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: "u1" } } })
    const response = await updateSession(createRequest("/login"))
    expect(response.headers.get("location")).toContain("/dashboard")
  })

  it("allows authenticated user on protected route", async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: "u1" } } })
    const response = await updateSession(createRequest("/dashboard"))
    expect(response.headers.get("location")).toBeNull()
  })

  it("does not redirect API routes even when unauthenticated", async () => {
    mockGetUser.mockResolvedValue({ data: { user: null } })
    const response = await updateSession(createRequest("/api/webhooks"))
    expect(response.headers.get("location")).toBeNull()
  })
})
