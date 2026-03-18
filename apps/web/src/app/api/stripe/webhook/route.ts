import { NextResponse } from "next/server"
import { createAdminClient } from "@/lib/supabase/admin"
import { getStripe } from "@/lib/stripe"
import type Stripe from "stripe"

const WEBHOOK_SECRET = process.env.STRIPE_WEBHOOK_SECRET!

export async function POST(request: Request) {
  const body = await request.text()
  const sig = request.headers.get("stripe-signature")

  if (!sig) {
    return NextResponse.json({ error: "Missing signature" }, { status: 400 })
  }

  let event: Stripe.Event
  try {
    event = getStripe().webhooks.constructEvent(body, sig, WEBHOOK_SECRET)
  } catch {
    return NextResponse.json({ error: "Invalid signature" }, { status: 400 })
  }

  const admin = createAdminClient()

  // Idempotency: insert event record first, skip if duplicate
  const { error: insertError } = await admin
    .from("subscription_events")
    .insert({
      stripe_event_id: event.id,
      event_type: event.type,
      payload: event.data.object as Record<string, unknown>,
    })

  if (insertError?.code === "23505") {
    // Duplicate event — already processed
    return NextResponse.json({ received: true })
  }

  try {
    switch (event.type) {
      case "checkout.session.completed":
        await handleCheckoutCompleted(admin, event.data.object as Stripe.Checkout.Session)
        break

      case "customer.subscription.updated":
        await handleSubscriptionUpdated(admin, event.data.object as Stripe.Subscription)
        break

      case "customer.subscription.deleted":
        await handleSubscriptionDeleted(admin, event.data.object as Stripe.Subscription)
        break

      case "invoice.payment_failed":
        await handlePaymentFailed(admin, event.data.object as Stripe.Invoice)
        break
    }
  } catch (err) {
    // Log but always return 200 to prevent Stripe retries
    console.error(`Webhook handler error for ${event.type}:`, err)
  }

  return NextResponse.json({ received: true })
}

type AdminClient = ReturnType<typeof createAdminClient>

function getUserId(obj: { metadata?: Record<string, string> | null }): string | null {
  return obj.metadata?.userId ?? null
}

async function findUserByCustomerId(admin: AdminClient, customerId: string) {
  const { data } = await admin
    .from("profiles")
    .select("id")
    .eq("stripe_customer_id", customerId)
    .single()
  return data?.id ?? null
}

async function handleCheckoutCompleted(admin: AdminClient, session: Stripe.Checkout.Session) {
  const userId = getUserId(session)
  if (!userId) return

  const subscriptionId = typeof session.subscription === "string"
    ? session.subscription
    : session.subscription?.id

  // Fetch subscription to get period end
  let periodEnd: string | null = null
  if (subscriptionId) {
    const sub = await getStripe().subscriptions.retrieve(subscriptionId)
    periodEnd = new Date(sub.current_period_end * 1000).toISOString()
  }

  await admin
    .from("profiles")
    .update({
      tier: "pro",
      stripe_customer_id: typeof session.customer === "string" ? session.customer : session.customer?.id,
      stripe_subscription_id: subscriptionId ?? null,
      subscription_status: "active",
      subscription_period_end: periodEnd,
    })
    .eq("id", userId)

  // Update event with user_id
  await admin
    .from("subscription_events")
    .update({ user_id: userId })
    .eq("stripe_event_id", session.id)
}

async function handleSubscriptionUpdated(admin: AdminClient, subscription: Stripe.Subscription) {
  const userId = getUserId(subscription) ?? await findUserByCustomerId(
    admin,
    typeof subscription.customer === "string" ? subscription.customer : subscription.customer.id
  )
  if (!userId) return

  const status = subscription.status
  const periodEnd = new Date(subscription.current_period_end * 1000).toISOString()

  // Only downgrade tier if canceled or unpaid (not past_due — Smart Retries)
  const tier = (status === "canceled" || status === "unpaid") ? "free" : "pro"

  await admin
    .from("profiles")
    .update({
      tier,
      subscription_status: mapStripeStatus(status),
      subscription_period_end: periodEnd,
    })
    .eq("id", userId)
}

async function handleSubscriptionDeleted(admin: AdminClient, subscription: Stripe.Subscription) {
  const userId = getUserId(subscription) ?? await findUserByCustomerId(
    admin,
    typeof subscription.customer === "string" ? subscription.customer : subscription.customer.id
  )
  if (!userId) return

  await admin
    .from("profiles")
    .update({
      tier: "free",
      stripe_subscription_id: null,
      subscription_status: "canceled",
      subscription_period_end: null,
    })
    .eq("id", userId)
}

async function handlePaymentFailed(admin: AdminClient, invoice: Stripe.Invoice) {
  const customerId = typeof invoice.customer === "string" ? invoice.customer : invoice.customer?.id
  if (!customerId) return

  const userId = await findUserByCustomerId(admin, customerId)
  if (!userId) return

  // Keep tier=pro for Smart Retries, just mark as past_due
  await admin
    .from("profiles")
    .update({ subscription_status: "past_due" })
    .eq("id", userId)
}

function mapStripeStatus(status: string): string {
  switch (status) {
    case "active": return "active"
    case "trialing": return "trialing"
    case "past_due": return "past_due"
    case "canceled":
    case "unpaid":
    case "incomplete_expired":
      return "canceled"
    default:
      return "none"
  }
}
