import { NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { createAdminClient } from "@/lib/supabase/admin"
import { getStripe } from "@/lib/stripe"

const VALID_PRICE_IDS = new Set([
  process.env.STRIPE_PRICE_MONTHLY,
  process.env.STRIPE_PRICE_ANNUAL,
])

export async function POST(request: Request) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 })
  }

  const body = await request.json()
  const { priceId } = body as { priceId?: string }

  if (!priceId || !VALID_PRICE_IDS.has(priceId)) {
    return NextResponse.json({ error: "Invalid price ID" }, { status: 400 })
  }

  // Fetch profile
  const { data: profile, error: profileError } = await supabase
    .from("profiles")
    .select("stripe_customer_id, email")
    .eq("id", user.id)
    .single()

  if (profileError || !profile) {
    return NextResponse.json({ error: "Profile not found" }, { status: 404 })
  }

  const stripe = getStripe()
  let customerId = profile.stripe_customer_id

  // Create Stripe customer if needed
  if (!customerId) {
    const customer = await stripe.customers.create({
      email: profile.email,
      metadata: { userId: user.id },
    })
    customerId = customer.id

    // Save customer ID to profile
    const admin = createAdminClient()
    await admin
      .from("profiles")
      .update({ stripe_customer_id: customerId })
      .eq("id", user.id)
  }

  // Create Checkout Session
  const session = await stripe.checkout.sessions.create({
    customer: customerId,
    mode: "subscription",
    line_items: [{ price: priceId, quantity: 1 }],
    success_url: `${process.env.NEXT_PUBLIC_APP_URL}/dashboard?checkout=success`,
    cancel_url: `${process.env.NEXT_PUBLIC_APP_URL}/pricing?checkout=canceled`,
    metadata: { userId: user.id },
    subscription_data: {
      metadata: { userId: user.id },
    },
  })

  return NextResponse.json({ checkoutUrl: session.url })
}
