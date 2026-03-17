import { describe, it, expect, vi, beforeEach } from "vitest"

vi.mock("next/cache", () => ({
  revalidatePath: vi.fn(),
}))

vi.mock("next/navigation", () => ({
  redirect: vi.fn(),
}))

const mockAuth = {
  signInWithOtp: vi.fn(),
  signInWithOAuth: vi.fn(),
  signOut: vi.fn(),
  getUser: vi.fn(),
}

const mockFrom = vi.fn()

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(() =>
    Promise.resolve({
      auth: mockAuth,
      from: mockFrom,
    })
  ),
}))

import {
  signInWithMagicLink,
  signOut,
  updateProfile,
  getProfile,
} from "./actions"
import { redirect } from "next/navigation"

describe("signInWithMagicLink", () => {
  beforeEach(() => vi.clearAllMocks())

  it("returns error when email is missing", async () => {
    const formData = new FormData()
    const result = await signInWithMagicLink(null, formData)
    expect(result.success).toBe(false)
    expect(result.error).toBe("Email is required")
  })

  it("calls signInWithOtp with correct params", async () => {
    mockAuth.signInWithOtp.mockResolvedValue({ error: null })
    const formData = new FormData()
    formData.set("email", "test@example.com")
    const result = await signInWithMagicLink(null, formData)
    expect(result.success).toBe(true)
    expect(mockAuth.signInWithOtp).toHaveBeenCalledWith({
      email: "test@example.com",
      options: { emailRedirectTo: expect.stringContaining("/auth/callback") },
    })
  })

  it("returns error on supabase error", async () => {
    mockAuth.signInWithOtp.mockResolvedValue({
      error: { message: "Rate limit exceeded" },
    })
    const formData = new FormData()
    formData.set("email", "test@example.com")
    const result = await signInWithMagicLink(null, formData)
    expect(result.success).toBe(false)
    expect(result.error).toBe("Rate limit exceeded")
  })
})

describe("signOut", () => {
  beforeEach(() => vi.clearAllMocks())

  it("signs out and redirects to login", async () => {
    mockAuth.signOut.mockResolvedValue({ error: null })
    await signOut()
    expect(mockAuth.signOut).toHaveBeenCalled()
    expect(redirect).toHaveBeenCalledWith("/login")
  })
})

describe("updateProfile", () => {
  beforeEach(() => vi.clearAllMocks())

  it("returns error when not authenticated", async () => {
    mockAuth.getUser.mockResolvedValue({ data: { user: null } })
    const formData = new FormData()
    const result = await updateProfile(null, formData)
    expect(result.success).toBe(false)
    expect(result.error).toBe("Not authenticated")
  })

  it("updates profile successfully", async () => {
    mockAuth.getUser.mockResolvedValue({
      data: { user: { id: "user-1" } },
    })
    mockFrom.mockReturnValue({
      update: vi.fn().mockReturnValue({
        eq: vi.fn().mockResolvedValue({ error: null }),
      }),
    })

    const formData = new FormData()
    formData.set("full_name", "Test User")
    formData.set("preferred_language", "en")
    const result = await updateProfile(null, formData)
    expect(result.success).toBe(true)
  })

  it("returns error on supabase error", async () => {
    mockAuth.getUser.mockResolvedValue({
      data: { user: { id: "user-1" } },
    })
    mockFrom.mockReturnValue({
      update: vi.fn().mockReturnValue({
        eq: vi.fn().mockResolvedValue({
          error: { message: "Update failed" },
        }),
      }),
    })

    const formData = new FormData()
    const result = await updateProfile(null, formData)
    expect(result.success).toBe(false)
    expect(result.error).toBe("Update failed")
  })
})

describe("getProfile", () => {
  beforeEach(() => vi.clearAllMocks())

  it("returns null when not authenticated", async () => {
    mockAuth.getUser.mockResolvedValue({ data: { user: null } })
    const result = await getProfile()
    expect(result).toBeNull()
  })

  it("returns profile data", async () => {
    const mockProfile = {
      id: "user-1",
      email: "test@example.com",
      tier: "free",
    }
    mockAuth.getUser.mockResolvedValue({
      data: { user: { id: "user-1" } },
    })
    mockFrom.mockReturnValue({
      select: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          single: vi.fn().mockResolvedValue({ data: mockProfile }),
        }),
      }),
    })

    const result = await getProfile()
    expect(result).toEqual(mockProfile)
  })
})
