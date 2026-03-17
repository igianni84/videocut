"use client"

import { signOut } from "@/lib/auth/actions"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { Button } from "@/components/ui/button"
import type { Profile } from "@/lib/auth/types"

export function UserNav({ profile }: { profile: Profile }) {
  const initials = profile.full_name
    ? profile.full_name
        .split(" ")
        .map((n) => n[0])
        .join("")
        .toUpperCase()
        .slice(0, 2)
    : profile.email[0].toUpperCase()

  return (
    <div className="flex items-center gap-3">
      <Avatar size="sm">
        {profile.avatar_url && (
          <AvatarImage
            src={profile.avatar_url}
            alt={profile.full_name ?? "Avatar"}
          />
        )}
        <AvatarFallback>{initials}</AvatarFallback>
      </Avatar>
      <span className="hidden text-sm font-medium sm:inline">
        {profile.full_name ?? profile.email}
      </span>
      <form action={signOut}>
        <Button variant="ghost" size="sm" type="submit">
          Sign out
        </Button>
      </form>
    </div>
  )
}
