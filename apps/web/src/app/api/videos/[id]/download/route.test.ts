import { describe, it, expect, vi, beforeEach, beforeAll } from "vitest"

const mockAuth = {
  getUser: vi.fn(),
}

const mockFrom = vi.fn()

const mockStorage = {
  from: vi.fn(),
}

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(() =>
    Promise.resolve({
      auth: mockAuth,
      from: mockFrom,
      storage: mockStorage,
    })
  ),
}))

let GET: typeof import("./route").GET

beforeAll(async () => {
  const mod = await import("./route")
  GET = mod.GET
})

describe("GET /api/videos/[id]/download", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  function makeParams(id: string) {
    return { params: Promise.resolve({ id }) }
  }

  it("returns 401 when not authenticated", async () => {
    mockAuth.getUser.mockResolvedValue({ data: { user: null } })

    const response = await GET(
      new Request("http://localhost/api/videos/vid-1/download"),
      makeParams("vid-1")
    )
    const body = await response.json()

    expect(response.status).toBe(401)
    expect(body.error).toBe("Not authenticated")
  })

  it("returns 404 when no completed job found", async () => {
    mockAuth.getUser.mockResolvedValue({
      data: { user: { id: "user-1" } },
    })

    mockFrom.mockReturnValue({
      select: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              not: vi.fn().mockReturnValue({
                order: vi.fn().mockReturnValue({
                  limit: vi.fn().mockReturnValue({
                    single: vi.fn().mockResolvedValue({
                      data: null,
                      error: { message: "No rows found" },
                    }),
                  }),
                }),
              }),
            }),
          }),
        }),
      }),
    })

    const response = await GET(
      new Request("http://localhost/api/videos/vid-1/download"),
      makeParams("vid-1")
    )
    const body = await response.json()

    expect(response.status).toBe(404)
    expect(body.error).toBe("No processed video available")
  })

  it("returns 200 with downloadUrl and filename on success", async () => {
    mockAuth.getUser.mockResolvedValue({
      data: { user: { id: "user-1" } },
    })

    let fromCallCount = 0
    mockFrom.mockImplementation(() => {
      fromCallCount++
      if (fromCallCount === 1) {
        // jobs table query
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                eq: vi.fn().mockReturnValue({
                  not: vi.fn().mockReturnValue({
                    order: vi.fn().mockReturnValue({
                      limit: vi.fn().mockReturnValue({
                        single: vi.fn().mockResolvedValue({
                          data: {
                            output_storage_path: "processed/user-1/vid-1.mp4",
                          },
                          error: null,
                        }),
                      }),
                    }),
                  }),
                }),
              }),
            }),
          }),
        }
      }
      // videos table query for filename
      return {
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            single: vi.fn().mockResolvedValue({
              data: { original_filename: "my-awesome-video.mp4" },
              error: null,
            }),
          }),
        }),
      }
    })

    mockStorage.from.mockReturnValue({
      createSignedUrl: vi.fn().mockResolvedValue({
        data: { signedUrl: "https://storage.example.com/signed-url" },
        error: null,
      }),
    })

    const response = await GET(
      new Request("http://localhost/api/videos/vid-1/download"),
      makeParams("vid-1")
    )
    const body = await response.json()

    expect(response.status).toBe(200)
    expect(body.downloadUrl).toBe("https://storage.example.com/signed-url")
    expect(body.filename).toBe("my-awesome-video_processed.mp4")
    expect(mockStorage.from).toHaveBeenCalledWith("processed")
  })
})
