import { describe, it, expect, vi, beforeEach } from "vitest"

const mockAuth = {
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

import { getJobs, getJobsForVideo } from "./actions"

const mockJobs = [
  {
    id: "job-1",
    user_id: "user-1",
    video_id: "vid-1",
    status: "completed",
    progress: 100,
    error_message: null,
    options: {},
    created_at: "2026-03-17T10:00:00Z",
  },
  {
    id: "job-2",
    user_id: "user-1",
    video_id: "vid-2",
    status: "queued",
    progress: 0,
    error_message: null,
    options: {},
    created_at: "2026-03-17T11:00:00Z",
  },
]

describe("getJobs", () => {
  beforeEach(() => vi.clearAllMocks())

  it("returns empty array when not authenticated", async () => {
    mockAuth.getUser.mockResolvedValue({ data: { user: null } })

    const result = await getJobs()

    expect(result).toEqual([])
    expect(mockFrom).not.toHaveBeenCalled()
  })

  it("returns jobs list when authenticated", async () => {
    mockAuth.getUser.mockResolvedValue({
      data: { user: { id: "user-1" } },
    })
    mockFrom.mockReturnValue({
      select: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          order: vi.fn().mockResolvedValue({ data: mockJobs }),
        }),
      }),
    })

    const result = await getJobs()

    expect(result).toEqual(mockJobs)
    expect(result).toHaveLength(2)
    expect(mockFrom).toHaveBeenCalledWith("jobs")
  })

  it("returns empty array when query returns null data", async () => {
    mockAuth.getUser.mockResolvedValue({
      data: { user: { id: "user-1" } },
    })
    mockFrom.mockReturnValue({
      select: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          order: vi.fn().mockResolvedValue({ data: null }),
        }),
      }),
    })

    const result = await getJobs()

    expect(result).toEqual([])
  })
})

describe("getJobsForVideo", () => {
  beforeEach(() => vi.clearAllMocks())

  it("returns empty array when not authenticated", async () => {
    mockAuth.getUser.mockResolvedValue({ data: { user: null } })

    const result = await getJobsForVideo("vid-1")

    expect(result).toEqual([])
    expect(mockFrom).not.toHaveBeenCalled()
  })

  it("returns jobs for specific video", async () => {
    const videoJobs = [mockJobs[0]]
    mockAuth.getUser.mockResolvedValue({
      data: { user: { id: "user-1" } },
    })

    const mockEqVideoId = vi.fn().mockReturnValue({
      eq: vi.fn().mockReturnValue({
        order: vi.fn().mockResolvedValue({ data: videoJobs }),
      }),
    })
    mockFrom.mockReturnValue({
      select: vi.fn().mockReturnValue({
        eq: mockEqVideoId,
      }),
    })

    const result = await getJobsForVideo("vid-1")

    expect(result).toEqual(videoJobs)
    expect(result).toHaveLength(1)
    expect(mockFrom).toHaveBeenCalledWith("jobs")
    expect(mockEqVideoId).toHaveBeenCalledWith("video_id", "vid-1")
  })

  it("returns empty array when query returns null data", async () => {
    mockAuth.getUser.mockResolvedValue({
      data: { user: { id: "user-1" } },
    })
    mockFrom.mockReturnValue({
      select: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            order: vi.fn().mockResolvedValue({ data: null }),
          }),
        }),
      }),
    })

    const result = await getJobsForVideo("vid-1")

    expect(result).toEqual([])
  })
})
