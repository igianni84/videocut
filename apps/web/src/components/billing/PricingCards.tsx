"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { Check } from "lucide-react"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Switch } from "@/components/ui/switch"
import { Label } from "@/components/ui/label"

type PricingCardsProps = {
  currentTier?: string | null
  isLoggedIn: boolean
}

const FREE_FEATURES = [
  "Up to 60s videos",
  "1080p max resolution",
  "Pause removal",
  "Dynamic subtitles",
  "Speed control",
]

const PRO_FEATURES = [
  "Up to 3 min videos",
  "4K resolution",
  "Pause removal",
  "Dynamic subtitles",
  "Speed control",
  "Smart crop & reformat",
  "Filler word removal",
  "Priority processing",
]

export function PricingCards({ currentTier, isLoggedIn }: PricingCardsProps) {
  const [annual, setAnnual] = useState(false)
  const [loading, setLoading] = useState(false)
  const router = useRouter()

  const price = annual ? "100" : "10"
  const period = annual ? "/year" : "/month"
  const savings = annual ? "Save 17%" : null

  async function handleUpgrade() {
    if (!isLoggedIn) {
      router.push("/login")
      return
    }

    setLoading(true)
    try {
      const priceId = annual
        ? process.env.NEXT_PUBLIC_STRIPE_PRICE_ANNUAL!
        : process.env.NEXT_PUBLIC_STRIPE_PRICE_MONTHLY!

      const res = await fetch("/api/stripe/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ priceId }),
      })

      if (!res.ok) {
        const data = await res.json()
        throw new Error(data.error || "Failed to start checkout")
      }

      const { checkoutUrl } = await res.json()
      window.location.href = checkoutUrl
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Something went wrong")
      setLoading(false)
    }
  }

  return (
    <div className="flex flex-col items-center gap-8">
      {/* Interval toggle */}
      <div className="flex items-center gap-3">
        <Label className={annual ? "text-muted-foreground" : ""}>Monthly</Label>
        <Switch checked={annual} onCheckedChange={setAnnual} />
        <Label className={annual ? "" : "text-muted-foreground"}>Annual</Label>
        {savings && (
          <Badge variant="secondary" className="ml-2">
            {savings}
          </Badge>
        )}
      </div>

      <div className="grid gap-6 sm:grid-cols-2 w-full max-w-3xl">
        {/* Free Plan */}
        <Card className={currentTier === "free" ? "border-primary" : ""}>
          <CardHeader>
            <CardTitle>Free</CardTitle>
            <CardDescription>Get started with basic editing</CardDescription>
            <p className="mt-2 text-3xl font-bold">
              EUR 0<span className="text-base font-normal text-muted-foreground">/month</span>
            </p>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            <ul className="space-y-2">
              {FREE_FEATURES.map((f) => (
                <li key={f} className="flex items-center gap-2 text-sm">
                  <Check className="h-4 w-4 text-primary" />
                  {f}
                </li>
              ))}
            </ul>
            {currentTier === "free" ? (
              <Button variant="outline" disabled>Current Plan</Button>
            ) : !isLoggedIn ? (
              <Button variant="outline" onClick={() => router.push("/login")}>
                Get Started Free
              </Button>
            ) : null}
          </CardContent>
        </Card>

        {/* Pro Plan */}
        <Card className={currentTier === "pro" ? "border-primary" : "border-primary/50"}>
          <CardHeader>
            <div className="flex items-center gap-2">
              <CardTitle>Pro</CardTitle>
              <Badge>Popular</Badge>
            </div>
            <CardDescription>For serious content creators</CardDescription>
            <p className="mt-2 text-3xl font-bold">
              EUR {price}
              <span className="text-base font-normal text-muted-foreground">{period}</span>
            </p>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            <ul className="space-y-2">
              {PRO_FEATURES.map((f) => (
                <li key={f} className="flex items-center gap-2 text-sm">
                  <Check className="h-4 w-4 text-primary" />
                  {f}
                </li>
              ))}
            </ul>
            {currentTier === "pro" ? (
              <Button variant="outline" disabled>Current Plan</Button>
            ) : (
              <Button onClick={handleUpgrade} disabled={loading}>
                {loading ? "Redirecting..." : "Upgrade to Pro"}
              </Button>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
