"use client"

import { useState } from "react"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"

export function ManageSubscriptionButton() {
  const [loading, setLoading] = useState(false)

  async function handleClick() {
    setLoading(true)
    try {
      const res = await fetch("/api/stripe/customer-portal", {
        method: "POST",
      })

      if (!res.ok) {
        const data = await res.json()
        throw new Error(data.error || "Failed to open billing portal")
      }

      const { portalUrl } = await res.json()
      window.location.href = portalUrl
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Something went wrong")
      setLoading(false)
    }
  }

  return (
    <Button variant="outline" onClick={handleClick} disabled={loading}>
      {loading ? "Opening..." : "Manage Subscription"}
    </Button>
  )
}
