# Stripe Integration Patterns for VideoCut

Pattern Stripe per Phase 7 — monetizzazione. Applica quando lavori su `apps/web/src/app/api/stripe/` o qualsiasi codice di billing/subscription.

## Checkout Session

```typescript
import Stripe from "stripe";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!);

export async function createCheckoutSession(
  userId: string,
  priceId: string,
  successUrl: string,
  cancelUrl: string
): Promise<Stripe.Checkout.Session> {
  return stripe.checkout.sessions.create({
    mode: "subscription",
    customer_email: undefined, // set se hai già l'email
    metadata: { userId },      // per collegare a Supabase dopo
    line_items: [{ price: priceId, quantity: 1 }],
    success_url: `${successUrl}?session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: cancelUrl,
    subscription_data: {
      metadata: { userId },
    },
  });
}
```

### Regole Checkout
- **Sempre `metadata.userId`** — collega la sessione all'utente Supabase
- **`mode: "subscription"`** — per piani ricorrenti (Pro, Business)
- **Success URL con session_id** — per verificare il pagamento lato client
- **Non fidarti del client** — verifica sempre via webhook, non via redirect

## Webhook Handling

```typescript
import { headers } from "next/headers";

export async function POST(req: Request) {
  const body = await req.text();
  const headersList = await headers();
  const signature = headersList.get("stripe-signature")!;

  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(
      body,
      signature,
      process.env.STRIPE_WEBHOOK_SECRET!
    );
  } catch {
    return new Response("Invalid signature", { status: 400 });
  }

  // Idempotency: controlla se l'evento è già stato processato
  const processed = await checkEventProcessed(event.id);
  if (processed) {
    return new Response("Already processed", { status: 200 });
  }

  switch (event.type) {
    case "checkout.session.completed":
      await handleCheckoutComplete(event.data.object);
      break;
    case "customer.subscription.updated":
      await handleSubscriptionUpdate(event.data.object);
      break;
    case "customer.subscription.deleted":
      await handleSubscriptionCancel(event.data.object);
      break;
    case "invoice.payment_failed":
      await handlePaymentFailed(event.data.object);
      break;
  }

  await markEventProcessed(event.id);
  return new Response("OK", { status: 200 });
}
```

### Regole Webhook
- **Verifica firma** — SEMPRE con `constructEvent`, mai fidarsi del body raw
- **Idempotency** — salva `event.id` e skippa duplicati (Stripe può reinviare)
- **Rispondi 200 veloce** — processa async se necessario, ma rispondi subito
- **`req.text()`** — body raw, non `req.json()` (serve per la firma)

## Subscription Lifecycle

```typescript
// Aggiorna subscription (upgrade/downgrade)
await stripe.subscriptions.update(subscriptionId, {
  items: [{ id: subscriptionItemId, price: newPriceId }],
  proration_behavior: "create_prorations",
});

// Cancella a fine periodo (non immediata)
await stripe.subscriptions.update(subscriptionId, {
  cancel_at_period_end: true,
});

// Riattiva subscription cancellata (prima della fine periodo)
await stripe.subscriptions.update(subscriptionId, {
  cancel_at_period_end: false,
});
```

### Regole Subscription
- **Upgrade/downgrade** — usa proration per calcolo automatico
- **Cancellazione** — sempre `cancel_at_period_end: true`, mai cancellazione immediata
- **Riattivazione** — possibile solo prima della fine del periodo corrente
- **Sync con Supabase** — aggiorna `subscriptions` table via webhook, mai direttamente

## Customer Portal

```typescript
const portalSession = await stripe.billingPortal.sessions.create({
  customer: stripeCustomerId,
  return_url: `${process.env.NEXT_PUBLIC_APP_URL}/settings/billing`,
});
// Redirect a portalSession.url
```

### Regole Portal
- **Configura nel Dashboard** — abilita metodi pagamento, cancellazione, upgrade
- **Return URL** — pagina settings/billing dell'app
- **Non reimplementare** — usa il portal per gestione carte/fatture

## Price/Product Mapping (Tiers VideoCut)

```typescript
// Mapping tiers → Stripe Price IDs (da env vars)
const TIER_PRICES: Record<string, string> = {
  free: "",                                        // no Stripe
  pro: process.env.STRIPE_PRICE_PRO!,             // €9.99/mese
  business: process.env.STRIPE_PRICE_BUSINESS!,   // €29.99/mese
};
```

### Regole Mapping
- **Price ID da env vars** — mai hardcodare, cambiano tra test/live
- **Free tier** — nessuna subscription Stripe, gestito solo in Supabase
- **Un Product per tier** — con Price mensile (e opzionalmente annuale)
- **Metadata su Product** — `tier: "pro"` per facile lookup

## Error Handling & Retry

```typescript
try {
  const session = await stripe.checkout.sessions.create({ ... });
} catch (error) {
  if (error instanceof Stripe.errors.StripeCardError) {
    // Errore carta: mostra messaggio all'utente
    return { error: error.message };
  }
  if (error instanceof Stripe.errors.StripeRateLimitError) {
    // Rate limit: retry con backoff
    await delay(1000);
    // retry...
  }
  // Altri errori: log e errore generico
  logger.error("Stripe error", { error });
  return { error: "Payment service unavailable" };
}
```

### Regole Error Handling
- **StripeCardError** — errore utente, mostra `error.message`
- **StripeRateLimitError** — retry con exponential backoff
- **StripeInvalidRequestError** — bug nel codice, fix necessario
- **Mai esporre dettagli Stripe** — mostra messaggi generici all'utente

## Testing con Stripe CLI

```bash
# Ascolta webhook in locale
stripe listen --forward-to localhost:3000/api/stripe/webhook

# Trigger evento test
stripe trigger checkout.session.completed

# Usa carte test
# 4242424242424242 — successo
# 4000000000000002 — declined
# 4000002500003155 — richiede 3D Secure
```

### Regole Testing
- **Stripe CLI** — per testare webhook in locale
- **Test mode** — usa chiavi `sk_test_*` e `pk_test_*`
- **Carte test** — usa carte documentate, non inventare numeri
- **Webhook secret locale** — diverso da quello di produzione, generato da `stripe listen`
