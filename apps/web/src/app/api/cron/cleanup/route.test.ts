import { describe, it, expect, vi, beforeEach, beforeAll } from "vitest"

const mockFrom = vi.fn()
const mockStorage = {
  from: vi.fn(),
}

const mockSupabase = {
  from: mockFrom,
  storage: mockStorage,
}

vi.mock("@supabase/supabase-js", () => ({
  createClient: vi.fn(() => mockSupabase),
}))

let GET: typeof import("./route").GET

beforeAll(async () => {
  process.env.CRON_SECRET = "test-cron-secret"
  process.env.NEXT_PUBLIC_SUPABASE_URL = "https://test.supabase.co"
  process.env.SUPABASE_SERVICE_ROLE_KEY = "test-service-role-key"
  const mod = await import("./route")
  GET = mod.GET
})

describe("GET /api/cron/cleanup", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it("returns 401 without proper authorization", async () => {
    const request = new Request("http://localhost/api/cron/cleanup", {
      headers: { authorization: "Bearer wrong-secret" },
    })

    const response = await GET(request)
    const body = await response.json()

    expect(response.status).toBe(401)
    expect(body.error).toBe("Unauthorized")
  })

  it("returns cleaned count on success", async () => {
    const request = new Request("http://localhost/api/cron/cleanup", {
      headers: { authorization: "Bearer test-cron-secret" },
    })

    const expiredJobs = [
      { id: "job-1", output_storage_path: "processed/user-1/vid-1.mp4" },
      { id: "job-2", output_storage_path: "processed/user-1/vid-2.mp4" },
    ]

    mockFrom.mockImplementation((table: string) => {
      if (table === "jobs") {
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              not: vi.fn().mockReturnValue({
                lt: vi.fn().mockResolvedValue({
                  data: expiredJobs,
                  error: null,
                }),
              }),
            }),
          }),
          update: vi.fn().mockReturnValue({
            in: vi.fn().mockResolvedValue({ error: null }),
          }),
        }
      }
      return {}
    })

    mockStorage.from.mockReturnValue({
      remove: vi.fn().mockResolvedValue({ error: null }),
    })

    const response = await GET(request)
    const body = await response.json()

    expect(response.status).toBe(200)
    expect(body.cleaned).toBe(2)
    expect(mockStorage.from).toHaveBeenCalledWith("processed")
  })

  it("handles empty expired jobs", async () => {
    const request = new Request("http://localhost/api/cron/cleanup", {
      headers: { authorization: "Bearer test-cron-secret" },
    })

    mockFrom.mockReturnValue({
      select: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          not: vi.fn().mockReturnValue({
            lt: vi.fn().mockResolvedValue({
              data: [],
              error: null,
            }),
          }),
        }),
      }),
    })

    const response = await GET(request)
    const body = await response.json()

    expect(response.status).toBe(200)
    expect(body.cleaned).toBe(0)
  })
})
