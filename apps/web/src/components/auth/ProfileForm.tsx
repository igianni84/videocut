"use client"

import { useActionState, useEffect, useRef, useState } from "react"
import { toast } from "sonner"

import { updateProfile } from "@/lib/auth/actions"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Badge } from "@/components/ui/badge"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Switch } from "@/components/ui/switch"
import { ManageSubscriptionButton } from "@/components/billing/ManageSubscriptionButton"
import type { AuthResult, Profile } from "@/lib/auth/types"

const LANGUAGES = [
  { value: "it", label: "Italiano" },
  { value: "en", label: "English" },
  { value: "es", label: "Espa\u00f1ol" },
  { value: "fr", label: "Fran\u00e7ais" },
  { value: "de", label: "Deutsch" },
  { value: "pt", label: "Portugu\u00eas" },
]

export function ProfileForm({ profile }: { profile: Profile }) {
  const [state, action, isPending] = useActionState(
    updateProfile,
    null as AuthResult | null
  )
  const [language, setLanguage] = useState(profile.preferred_language ?? "auto")
  const [notifEnabled, setNotifEnabled] = useState(profile.email_notifications)
  const notifFormRef = useRef<HTMLFormElement>(null)
  const isFirstRender = useRef(true)

  useEffect(() => {
    if (state?.success) {
      toast.success("Profile updated successfully.")
    } else if (state?.error) {
      toast.error(state.error)
    }
  }, [state])

  // Auto-submit notifications form when switch changes
  useEffect(() => {
    if (isFirstRender.current) {
      isFirstRender.current = false
      return
    }
    notifFormRef.current?.requestSubmit()
  }, [notifEnabled])

  return (
    <div className="flex max-w-lg flex-col gap-6">
      <Card>
        <CardHeader>
          <CardTitle>Account Info</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <div className="flex flex-col gap-1">
            <Label>Email</Label>
            <p className="text-sm text-muted-foreground">{profile.email}</p>
          </div>
          <div className="flex flex-col gap-1">
            <Label>Plan</Label>
            <div className="flex items-center gap-2">
              <Badge
                variant={profile.tier === "pro" ? "default" : "secondary"}
              >
                {profile.tier.toUpperCase()}
              </Badge>
              <span className="text-sm capitalize text-muted-foreground">
                {profile.subscription_status}
              </span>
            </div>
          </div>
          <div className="flex flex-col gap-1">
            <Label>Member since</Label>
            <p className="text-sm text-muted-foreground">
              {new Date(profile.created_at).toLocaleDateString()}
            </p>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Edit Profile</CardTitle>
        </CardHeader>
        <CardContent>
          <form action={action} className="flex flex-col gap-4">
            <div className="flex flex-col gap-2">
              <Label htmlFor="full_name">Full name</Label>
              <Input
                id="full_name"
                name="full_name"
                defaultValue={profile.full_name ?? ""}
                placeholder="Your name"
              />
            </div>
            <div className="flex flex-col gap-2">
              <Label>Preferred language</Label>
              <Select value={language} onValueChange={(val) => { if (val) setLanguage(val) }}>
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {LANGUAGES.map((lang) => (
                    <SelectItem key={lang.value} value={lang.value}>
                      {lang.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <input type="hidden" name="preferred_language" value={language} />
            </div>
            <Button type="submit" disabled={isPending} className="w-fit">
              {isPending ? "Saving..." : "Save changes"}
            </Button>
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Notifications</CardTitle>
        </CardHeader>
        <CardContent>
          <form ref={notifFormRef} action={action} className="flex flex-col gap-4">
            <input type="hidden" name="full_name" value={profile.full_name ?? ""} />
            <input type="hidden" name="preferred_language" value={profile.preferred_language ?? "auto"} />
            {notifEnabled && <input type="hidden" name="email_notifications" value="on" />}
            <div className="flex items-center justify-between">
              <div>
                <Label htmlFor="email_notifications">Email when video is ready</Label>
                <p className="text-xs text-muted-foreground">
                  Get notified when your video finishes processing
                </p>
              </div>
              <Switch
                id="email_notifications"
                checked={notifEnabled}
                onCheckedChange={setNotifEnabled}
              />
            </div>
          </form>
        </CardContent>
      </Card>

      {/* Subscription Card */}
      <Card>
        <CardHeader>
          <CardTitle>Subscription</CardTitle>
          <CardDescription>
            {profile.tier === "pro" ? "You're on the Pro plan" : "Upgrade to unlock more features"}
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          {profile.tier === "free" ? (
            <>
              <div className="rounded-md border p-4">
                <p className="text-sm font-medium">Free Plan Limits</p>
                <ul className="mt-2 space-y-1 text-sm text-muted-foreground">
                  <li>Up to 60s videos</li>
                  <li>1080p max resolution</li>
                </ul>
              </div>
              <div className="rounded-md border border-primary/30 bg-primary/5 p-4">
                <p className="text-sm font-medium">Pro Plan — EUR 10/month</p>
                <ul className="mt-2 space-y-1 text-sm text-muted-foreground">
                  <li>Up to 3 min videos</li>
                  <li>4K resolution</li>
                  <li>Smart crop, filler removal, priority processing</li>
                </ul>
              </div>
              <a href="/pricing">
                <Button className="w-full">Upgrade to Pro</Button>
              </a>
            </>
          ) : (
            <>
              <div className="flex items-center gap-2">
                <Badge variant="default">PRO</Badge>
                <Badge
                  variant={
                    profile.subscription_status === "active"
                      ? "secondary"
                      : profile.subscription_status === "past_due"
                        ? "destructive"
                        : "outline"
                  }
                >
                  {profile.subscription_status}
                </Badge>
              </div>

              {profile.subscription_status === "past_due" && (
                <div className="rounded-md border border-destructive bg-destructive/10 p-3 text-sm text-destructive">
                  Your last payment failed. Please update your payment method to keep your Pro access.
                </div>
              )}

              {profile.subscription_status === "canceled" && profile.subscription_period_end && (
                <div className="rounded-md border border-amber-500 bg-amber-500/10 p-3 text-sm text-amber-700 dark:text-amber-400">
                  Your plan ends on{" "}
                  {new Date(profile.subscription_period_end).toLocaleDateString()}. You'll keep Pro
                  access until then.
                </div>
              )}

              {profile.subscription_period_end &&
                profile.subscription_status === "active" && (
                  <p className="text-sm text-muted-foreground">
                    Next billing date:{" "}
                    {new Date(profile.subscription_period_end).toLocaleDateString()}
                  </p>
                )}

              <ManageSubscriptionButton />
            </>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
