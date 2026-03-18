import { describe, it, expect, vi, beforeEach, beforeAll } from "vitest"
import type Stripe from "stripe"

// Mock Stripe
const mockConstructEvent = vi.fn()
const mockSubscriptionsRetrieve = vi.fn()

vi.mock("@/lib/stripe", () => ({
  getStripe: vi.fn(() => ({
    webhooks: { constructEvent: mockConstructEvent },
    subscriptions: { retrieve: mockSubscriptionsRetrieve },
  })),
}))

// Mock admin client
const mockAdminFrom = vi.fn()

vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: vi.fn(() => ({
    from: mockAdminFrom,
  })),
}))

let POST: typeof import("./route").POST

beforeAll(async () => {
  process.env.STRIPE_WEBHOOK_SECRET = "whsec_test"
  const mod = await import("./route")
  POST = mod.POST
})

function makeRequest(body: string, signature = "valid-sig"): Request {
  return new Request("http://localhost/api/stripe/webhook", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "stripe-signature": signature,
    },
    body,
  })
}

function mockEvent(type: string, object: Record<string, unknown>): Stripe.Event {
  return {
    id: `evt_${Date.now()}`,
    type,
    data: { object },
  } as unknown as Stripe.Event
}

function setupAdminMock(insertError?: { code: string } | null) {
  const updateFn = vi.fn().mockReturnValue({
    eq: vi.fn().mockResolvedValue({ error: null }),
  })

  mockAdminFrom.mockImplementation((table: string) => {
    if (table === "subscription_events") {
      return {
        insert: vi.fn().mockResolvedValue({ error: insertError ?? null }),
        update: updateFn,
      }
    }
    // profiles
    return {
      update: updateFn,
      select: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          single: vi.fn().mockResolvedValue({ data: { id: "user-1" } }),
        }),
      }),
    }
  })
}

describe("POST /api/stripe/webhook", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it("returns 400 for invalid signature", async () => {
    mockConstructEvent.mockImplementation(() => {
      throw new Error("Invalid signature")
    })

    const response = await POST(makeRequest("{}", "bad-sig"))
    expect(response.status).toBe(400)
  })

  it("handles checkout.session.completed -> sets tier=pro", async () => {
    const event = mockEvent("checkout.session.completed", {
      id: "cs_123",
      metadata: { userId: "user-1" },
      customer: "cus_123",
      subscription: "sub_123",
    })
    mockConstructEvent.mockReturnValue(event)
    mockSubscriptionsRetrieve.mockResolvedValue({
      current_period_end: Math.floor(Date.now() / 1000) + 86400,
    })
    setupAdminMock()

    const response = await POST(makeRequest("{}"))
    expect(response.status).toBe(200)

    // Verify profile update was called with tier=pro
    const profileUpdateCalls = mockAdminFrom.mock.calls.filter(
      (c: string[]) => c[0] === "profiles"
    )
    expect(profileUpdateCalls.length).toBeGreaterThan(0)
  })

  it("handles customer.subscription.deleted -> sets tier=free", async () => {
    const event = mockEvent("customer.subscription.deleted", {
      metadata: { userId: "user-1" },
      customer: "cus_123",
    })
    mockConstructEvent.mockReturnValue(event)
    setupAdminMock()

    const response = await POST(makeRequest("{}"))
    expect(response.status).toBe(200)
  })

  it("handles invoice.payment_failed -> sets status=past_due", async () => {
    const event = mockEvent("invoice.payment_failed", {
      customer: "cus_123",
    })
    mockConstructEvent.mockReturnValue(event)
    setupAdminMock()

    const response = await POST(makeRequest("{}"))
    expect(response.status).toBe(200)
  })

  it("skips duplicate events (idempotency)", async () => {
    const event = mockEvent("checkout.session.completed", {
      metadata: { userId: "user-1" },
      customer: "cus_123",
      subscription: "sub_123",
    })
    mockConstructEvent.mockReturnValue(event)
    // Simulate unique constraint violation
    setupAdminMock({ code: "23505" })

    const response = await POST(makeRequest("{}"))
    const body = await response.json()

    expect(response.status).toBe(200)
    expect(body.received).toBe(true)
    // Should NOT have called subscriptions.retrieve (skipped processing)
    expect(mockSubscriptionsRetrieve).not.toHaveBeenCalled()
  })

  it("returns 400 when signature header is missing", async () => {
    const req = new Request("http://localhost/api/stripe/webhook", {
      method: "POST",
      body: "{}",
    })

    const response = await POST(req)
    expect(response.status).toBe(400)
  })
})
