import { describe, it, expect, vi, beforeEach, beforeAll } from "vitest"

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

const mockAdminFrom = vi.fn()

vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: vi.fn(() => ({
    from: mockAdminFrom,
  })),
}))

// Mock global fetch for processing service calls
const mockFetch = vi.fn()
vi.stubGlobal("fetch", mockFetch)

// Dynamic import so env vars are set before module-level reads
let GET: typeof import("./route").GET
let POST: typeof import("./route").POST

beforeAll(async () => {
  process.env.PROCESSING_SERVICE_URL = "http://processor:8000"
  process.env.PROCESSING_API_KEY = "test-api-key"
  const mod = await import("./route")
  GET = mod.GET
  POST = mod.POST
})

describe("GET /api/jobs", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it("returns 401 when not authenticated", async () => {
    mockAuth.getUser.mockResolvedValue({ data: { user: null } })

    const response = await GET()
    const body = await response.json()

    expect(response.status).toBe(401)
    expect(body.error).toBe("Not authenticated")
  })

  it("returns jobs list for authenticated user", async () => {
    const mockJobs = [
      { id: "job-1", status: "queued", video_id: "vid-1" },
      { id: "job-2", status: "completed", video_id: "vid-2" },
    ]
    mockAuth.getUser.mockResolvedValue({
      data: { user: { id: "user-1" } },
    })
    mockFrom.mockReturnValue({
      select: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          order: vi.fn().mockResolvedValue({ data: mockJobs, error: null }),
        }),
      }),
    })

    const response = await GET()
    const body = await response.json()

    expect(response.status).toBe(200)
    expect(body.jobs).toEqual(mockJobs)
    expect(body.jobs).toHaveLength(2)
  })

  it("returns 500 on database error", async () => {
    mockAuth.getUser.mockResolvedValue({
      data: { user: { id: "user-1" } },
    })
    mockFrom.mockReturnValue({
      select: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          order: vi.fn().mockResolvedValue({
            data: null,
            error: { message: "DB connection failed" },
          }),
        }),
      }),
    })

    const response = await GET()
    const body = await response.json()

    expect(response.status).toBe(500)
    expect(body.error).toBe("DB connection failed")
  })
})

describe("POST /api/jobs", () => {
  function makeRequest(payload: Record<string, unknown>): Request {
    return new Request("http://localhost/api/jobs", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    })
  }

  beforeEach(() => {
    vi.clearAllMocks()
  })

  it("returns 401 when not authenticated", async () => {
    mockAuth.getUser.mockResolvedValue({ data: { user: null } })

    const response = await POST(makeRequest({ videoId: "vid-1" }))
    const body = await response.json()

    expect(response.status).toBe(401)
    expect(body.error).toBe("Not authenticated")
  })

  it("returns 404 when video not found", async () => {
    mockAuth.getUser.mockResolvedValue({
      data: { user: { id: "user-1" } },
    })
    mockFrom.mockReturnValue({
      select: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            single: vi.fn().mockResolvedValue({
              data: null,
              error: { message: "Not found" },
            }),
          }),
        }),
      }),
    })

    const response = await POST(makeRequest({ videoId: "nonexistent" }))
    const body = await response.json()

    expect(response.status).toBe(404)
    expect(body.error).toBe("Video not found")
  })

  it("returns 409 when video is already processing", async () => {
    mockAuth.getUser.mockResolvedValue({
      data: { user: { id: "user-1" } },
    })
    mockFrom.mockReturnValue({
      select: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            single: vi.fn().mockResolvedValue({
              data: {
                id: "vid-1",
                storage_path: "uploads/vid-1.mp4",
                status: "processing",
              },
              error: null,
            }),
          }),
        }),
      }),
    })

    const response = await POST(makeRequest({ videoId: "vid-1" }))
    const body = await response.json()

    expect(response.status).toBe(409)
    expect(body.error).toBe("Video is already being processed")
  })

  it("returns 403 when free user submits video > 60s", async () => {
    mockAuth.getUser.mockResolvedValue({
      data: { user: { id: "user-1" } },
    })

    let fromCallCount = 0
    mockFrom.mockImplementation(() => {
      fromCallCount++
      if (fromCallCount === 1) {
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                single: vi.fn().mockResolvedValue({
                  data: {
                    id: "vid-1",
                    storage_path: "uploads/vid-1.mp4",
                    status: "uploaded",
                    duration_seconds: 90,
                  },
                  error: null,
                }),
              }),
            }),
          }),
        }
      }
      // profiles table
      return {
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            single: vi.fn().mockResolvedValue({
              data: { tier: "free", subscription_status: "none" },
              error: null,
            }),
          }),
        }),
      }
    })

    const response = await POST(makeRequest({ videoId: "vid-1" }))
    const body = await response.json()

    expect(response.status).toBe(403)
    expect(body.error).toContain("exceeds")
  })

  it("returns 403 when free user requests 4K resolution", async () => {
    mockAuth.getUser.mockResolvedValue({
      data: { user: { id: "user-1" } },
    })

    let fromCallCount = 0
    mockFrom.mockImplementation(() => {
      fromCallCount++
      if (fromCallCount === 1) {
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                single: vi.fn().mockResolvedValue({
                  data: {
                    id: "vid-1",
                    storage_path: "uploads/vid-1.mp4",
                    status: "uploaded",
                    duration_seconds: 30,
                  },
                  error: null,
                }),
              }),
            }),
          }),
        }
      }
      // profiles table
      return {
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            single: vi.fn().mockResolvedValue({
              data: { tier: "free", subscription_status: "none" },
              error: null,
            }),
          }),
        }),
      }
    })

    const response = await POST(
      makeRequest({ videoId: "vid-1", options: { output_resolution: "4k" } })
    )
    const body = await response.json()

    expect(response.status).toBe(403)
    expect(body.error).toContain("4K")
  })

  it("allows pro user with 3min video and 4K", async () => {
    mockAuth.getUser.mockResolvedValue({
      data: { user: { id: "user-1" } },
    })

    let fromCallCount = 0
    mockFrom.mockImplementation(() => {
      fromCallCount++
      if (fromCallCount === 1) {
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                single: vi.fn().mockResolvedValue({
                  data: {
                    id: "vid-1",
                    storage_path: "uploads/vid-1.mp4",
                    status: "uploaded",
                    duration_seconds: 150,
                  },
                  error: null,
                }),
              }),
            }),
          }),
        }
      }
      if (fromCallCount === 2) {
        // profiles table
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              single: vi.fn().mockResolvedValue({
                data: { tier: "pro", subscription_status: "active" },
                error: null,
              }),
            }),
          }),
        }
      }
      if (fromCallCount === 3) {
        // concurrent jobs check
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              in: vi.fn().mockResolvedValue({ count: 0 }),
            }),
          }),
        }
      }
      // jobs insert
      return {
        insert: vi.fn().mockReturnValue({
          select: vi.fn().mockReturnValue({
            single: vi.fn().mockResolvedValue({
              data: { id: "job-new", status: "queued" },
              error: null,
            }),
          }),
        }),
      }
    })

    mockAdminFrom.mockReturnValue({
      update: vi.fn().mockReturnValue({
        eq: vi.fn().mockResolvedValue({ error: null }),
      }),
    })

    mockFetch.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ status: "accepted" }),
    })

    const response = await POST(
      makeRequest({ videoId: "vid-1", options: { output_resolution: "4k" } })
    )
    const body = await response.json()

    expect(response.status).toBe(201)
    expect(body.id).toBe("job-new")
  })

  it("returns 429 when concurrent job limit reached", async () => {
    mockAuth.getUser.mockResolvedValue({
      data: { user: { id: "user-1" } },
    })

    let fromCallCount = 0
    mockFrom.mockImplementation(() => {
      fromCallCount++
      if (fromCallCount === 1) {
        // videos table: returns valid uploaded video
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                single: vi.fn().mockResolvedValue({
                  data: {
                    id: "vid-1",
                    storage_path: "uploads/vid-1.mp4",
                    status: "uploaded",
                    duration_seconds: 30,
                  },
                  error: null,
                }),
              }),
            }),
          }),
        }
      }
      if (fromCallCount === 2) {
        // profiles table
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              single: vi.fn().mockResolvedValue({
                data: { tier: "free", subscription_status: "none" },
                error: null,
              }),
            }),
          }),
        }
      }
      // jobs table: concurrent limit check returns count >= 3
      return {
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            in: vi.fn().mockResolvedValue({ count: 3 }),
          }),
        }),
      }
    })

    const response = await POST(makeRequest({ videoId: "vid-1" }))
    const body = await response.json()

    expect(response.status).toBe(429)
    expect(body.error).toContain("concurrent jobs")
  })

  it("returns 201 on success", async () => {
    mockAuth.getUser.mockResolvedValue({
      data: { user: { id: "user-1" } },
    })

    let fromCallCount = 0
    mockFrom.mockImplementation(() => {
      fromCallCount++
      if (fromCallCount === 1) {
        // videos table: valid uploaded video
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                single: vi.fn().mockResolvedValue({
                  data: {
                    id: "vid-1",
                    storage_path: "uploads/vid-1.mp4",
                    status: "uploaded",
                    duration_seconds: 30,
                  },
                  error: null,
                }),
              }),
            }),
          }),
        }
      }
      if (fromCallCount === 2) {
        // profiles table: tier check
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              single: vi.fn().mockResolvedValue({
                data: { tier: "free", subscription_status: "none" },
                error: null,
              }),
            }),
          }),
        }
      }
      if (fromCallCount === 3) {
        // jobs table: concurrent limit check returns 0
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              in: vi.fn().mockResolvedValue({ count: 0 }),
            }),
          }),
        }
      }
      // jobs table: insert new job
      return {
        insert: vi.fn().mockReturnValue({
          select: vi.fn().mockReturnValue({
            single: vi.fn().mockResolvedValue({
              data: { id: "job-new", status: "queued" },
              error: null,
            }),
          }),
        }),
      }
    })

    // Admin client: update video status to processing
    mockAdminFrom.mockReturnValue({
      update: vi.fn().mockReturnValue({
        eq: vi.fn().mockResolvedValue({ error: null }),
      }),
    })

    mockFetch.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ status: "accepted" }),
    })

    const response = await POST(
      makeRequest({ videoId: "vid-1", options: { silence_threshold_ms: 300 } })
    )
    const body = await response.json()

    expect(response.status).toBe(201)
    expect(body.id).toBe("job-new")
    expect(body.status).toBe("queued")
    expect(mockFetch).toHaveBeenCalledWith(
      "http://processor:8000/process",
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({
          "Content-Type": "application/json",
          "X-API-Key": "test-api-key",
        }),
      })
    )
  })

  it("returns 502 when processing service returns error", async () => {
    mockAuth.getUser.mockResolvedValue({
      data: { user: { id: "user-1" } },
    })

    let fromCallCount = 0
    mockFrom.mockImplementation(() => {
      fromCallCount++
      if (fromCallCount === 1) {
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                single: vi.fn().mockResolvedValue({
                  data: {
                    id: "vid-1",
                    storage_path: "uploads/vid-1.mp4",
                    status: "uploaded",
                    duration_seconds: 30,
                  },
                  error: null,
                }),
              }),
            }),
          }),
        }
      }
      if (fromCallCount === 2) {
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              single: vi.fn().mockResolvedValue({
                data: { tier: "free", subscription_status: "none" },
                error: null,
              }),
            }),
          }),
        }
      }
      if (fromCallCount === 3) {
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              in: vi.fn().mockResolvedValue({ count: 0 }),
            }),
          }),
        }
      }
      return {
        insert: vi.fn().mockReturnValue({
          select: vi.fn().mockReturnValue({
            single: vi.fn().mockResolvedValue({
              data: { id: "job-new", status: "queued" },
              error: null,
            }),
          }),
        }),
      }
    })

    // Admin client: update video status + rollback calls
    mockAdminFrom.mockReturnValue({
      update: vi.fn().mockReturnValue({
        eq: vi.fn().mockResolvedValue({ error: null }),
      }),
    })

    mockFetch.mockResolvedValue({
      ok: false,
      text: () => Promise.resolve("Internal Server Error"),
    })

    const response = await POST(makeRequest({ videoId: "vid-1" }))
    const body = await response.json()

    expect(response.status).toBe(502)
    expect(body.error).toBe("Failed to start processing")
  })

  it("returns 503 when processing service is unreachable", async () => {
    mockAuth.getUser.mockResolvedValue({
      data: { user: { id: "user-1" } },
    })

    let fromCallCount = 0
    mockFrom.mockImplementation(() => {
      fromCallCount++
      if (fromCallCount === 1) {
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                single: vi.fn().mockResolvedValue({
                  data: {
                    id: "vid-1",
                    storage_path: "uploads/vid-1.mp4",
                    status: "uploaded",
                    duration_seconds: 30,
                  },
                  error: null,
                }),
              }),
            }),
          }),
        }
      }
      if (fromCallCount === 2) {
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              single: vi.fn().mockResolvedValue({
                data: { tier: "free", subscription_status: "none" },
                error: null,
              }),
            }),
          }),
        }
      }
      if (fromCallCount === 3) {
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              in: vi.fn().mockResolvedValue({ count: 0 }),
            }),
          }),
        }
      }
      return {
        insert: vi.fn().mockReturnValue({
          select: vi.fn().mockReturnValue({
            single: vi.fn().mockResolvedValue({
              data: { id: "job-new", status: "queued" },
              error: null,
            }),
          }),
        }),
      }
    })

    // Admin client: update video status + rollback calls
    mockAdminFrom.mockReturnValue({
      update: vi.fn().mockReturnValue({
        eq: vi.fn().mockResolvedValue({ error: null }),
      }),
    })

    mockFetch.mockRejectedValue(new Error("ECONNREFUSED"))

    const response = await POST(makeRequest({ videoId: "vid-1" }))
    const body = await response.json()

    expect(response.status).toBe(503)
    expect(body.error).toBe("Processing service unavailable")
  })
})
