import Link from "next/link"

import { getProfile } from "@/lib/auth/actions"
import { getVideos } from "@/lib/videos/actions"
import { Badge } from "@/components/ui/badge"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"

export const metadata = {
  title: "Dashboard — VideoCut",
}

export default async function DashboardPage() {
  const profile = await getProfile()

  if (!profile) return null

  const videos = await getVideos()

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold">
          Welcome{profile.full_name ? `, ${profile.full_name}` : ""}
        </h1>
        <p className="text-muted-foreground">
          Manage your videos and settings
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <Card>
          <CardHeader>
            <CardTitle>Plan</CardTitle>
            <CardDescription>Your current subscription</CardDescription>
          </CardHeader>
          <CardContent>
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
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Videos</CardTitle>
            <CardDescription>Your uploaded videos</CardDescription>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">{videos.length}</p>
            <Link
              href="/videos"
              className="text-sm font-medium text-primary hover:underline"
            >
              Manage videos
            </Link>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Profile</CardTitle>
            <CardDescription>Your account settings</CardDescription>
          </CardHeader>
          <CardContent>
            <Link
              href="/profile"
              className="text-sm font-medium text-primary hover:underline"
            >
              Edit profile
            </Link>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
