"use client"

import { useActionState } from "react"

import { updateProfile } from "@/lib/auth/actions"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Badge } from "@/components/ui/badge"
import { Alert, AlertDescription } from "@/components/ui/alert"
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
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

  return (
    <div className="flex max-w-lg flex-col gap-6">
      {state?.success && (
        <Alert>
          <AlertDescription>Profile updated successfully.</AlertDescription>
        </Alert>
      )}

      {state?.error && (
        <Alert variant="destructive">
          <AlertDescription>{state.error}</AlertDescription>
        </Alert>
      )}

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
              <Label htmlFor="preferred_language">Preferred language</Label>
              <select
                id="preferred_language"
                name="preferred_language"
                defaultValue={profile.preferred_language ?? "auto"}
                className="h-8 w-full rounded-lg border border-input bg-transparent px-2.5 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 dark:bg-input/30"
              >
                {LANGUAGES.map((lang) => (
                  <option key={lang.value} value={lang.value}>
                    {lang.label}
                  </option>
                ))}
              </select>
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
          <form action={action} className="flex flex-col gap-4">
            {/* Preserve current profile values as hidden inputs */}
            <input type="hidden" name="full_name" value={profile.full_name ?? ""} />
            <input type="hidden" name="preferred_language" value={profile.preferred_language ?? "auto"} />
            <div className="flex items-center justify-between">
              <div>
                <Label htmlFor="email_notifications">Email when video is ready</Label>
                <p className="text-xs text-muted-foreground">
                  Get notified when your video finishes processing
                </p>
              </div>
              <label className="relative inline-flex cursor-pointer items-center">
                <input
                  type="checkbox"
                  id="email_notifications"
                  name="email_notifications"
                  defaultChecked={profile.email_notifications}
                  className="peer sr-only"
                  onChange={(e) => e.target.form?.requestSubmit()}
                />
                <div className="h-5 w-9 rounded-full bg-zinc-200 after:absolute after:start-[2px] after:top-[2px] after:h-4 after:w-4 after:rounded-full after:bg-white after:transition-all peer-checked:bg-zinc-900 peer-checked:after:translate-x-full dark:bg-zinc-700 dark:peer-checked:bg-zinc-400" />
              </label>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  )
}
