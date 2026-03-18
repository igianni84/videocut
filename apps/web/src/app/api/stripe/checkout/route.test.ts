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

const mockCustomersCreate = vi.fn()
const mockCheckoutSessionsCreate = vi.fn()

vi.mock("@/lib/stripe", () => ({
  getStripe: vi.fn(() => ({
    customers: { create: mockCustomersCreate },
    checkout: {
      sessions: { create: mockCheckoutSessionsCreate },
    },
  })),
}))

let POST: typeof import("./route").POST

beforeAll(async () => {
  process.env.STRIPE_PRICE_MONTHLY = "price_monthly_test"
  process.env.STRIPE_PRICE_ANNUAL = "price_annual_test"
  process.env.NEXT_PUBLIC_APP_URL = "http://localhost:3000"
  const mod = await import("./route")
  POST = mod.POST
})

function makeRequest(body: Record<string, unknown>): Request {
  return new Request("http://localhost/api/stripe/checkout", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  })
}

describe("POST /api/stripe/checkout", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it("returns 401 when not authenticated", async () => {
    mockAuth.getUser.mockResolvedValue({ data: { user: null } })

    const response = await POST(makeRequest({ priceId: "price_monthly_test" }))
    expect(response.status).toBe(401)
  })

  it("returns 400 for invalid priceId", async () => {
    mockAuth.getUser.mockResolvedValue({
      data: { user: { id: "user-1" } },
    })

    const response = await POST(makeRequest({ priceId: "price_invalid" }))
    expect(response.status).toBe(400)
  })

  it("creates new customer and checkout session", async () => {
    mockAuth.getUser.mockResolvedValue({
      data: { user: { id: "user-1" } },
    })

    // Profile with no stripe_customer_id
    mockFrom.mockReturnValue({
      select: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          single: vi.fn().mockResolvedValue({
            data: { stripe_customer_id: null, email: "test@example.com" },
            error: null,
          }),
        }),
      }),
    })

    mockCustomersCreate.mockResolvedValue({ id: "cus_new" })
    mockAdminFrom.mockReturnValue({
      update: vi.fn().mockReturnValue({
        eq: vi.fn().mockResolvedValue({ error: null }),
      }),
    })
    mockCheckoutSessionsCreate.mockResolvedValue({
      url: "https://checkout.stripe.com/test",
    })

    const response = await POST(makeRequest({ priceId: "price_monthly_test" }))
    const body = await response.json()

    expect(response.status).toBe(200)
    expect(body.checkoutUrl).toBe("https://checkout.stripe.com/test")
    expect(mockCustomersCreate).toHaveBeenCalledWith({
      email: "test@example.com",
      metadata: { userId: "user-1" },
    })
  })

  it("uses existing customer for checkout", async () => {
    mockAuth.getUser.mockResolvedValue({
      data: { user: { id: "user-1" } },
    })

    // Profile with existing stripe_customer_id
    mockFrom.mockReturnValue({
      select: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          single: vi.fn().mockResolvedValue({
            data: { stripe_customer_id: "cus_existing", email: "test@example.com" },
            error: null,
          }),
        }),
      }),
    })

    mockCheckoutSessionsCreate.mockResolvedValue({
      url: "https://checkout.stripe.com/test",
    })

    const response = await POST(makeRequest({ priceId: "price_monthly_test" }))
    const body = await response.json()

    expect(response.status).toBe(200)
    expect(body.checkoutUrl).toBe("https://checkout.stripe.com/test")
    // Should NOT create a new customer
    expect(mockCustomersCreate).not.toHaveBeenCalled()
  })
})
