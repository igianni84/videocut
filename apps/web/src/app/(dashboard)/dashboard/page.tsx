import { Suspense } from "react"
import Link from "next/link"
import { Film, CheckCircle, Clock, CreditCard, Upload, History, Sparkles } from "lucide-react"

import { getProfile } from "@/lib/auth/actions"
import { getVideos } from "@/lib/videos/actions"
import { getJobs } from "@/lib/jobs/actions"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { DashboardSkeleton } from "@/components/upload/VideoCardSkeleton"

export const metadata = {
  title: "Dashboard — VideoCut",
}

export default function DashboardPage() {
  return (
    <Suspense fallback={<DashboardSkeleton />}>
      <DashboardContent />
    </Suspense>
  )
}

async function DashboardContent() {
  const profile = await getProfile()

  if (!profile) return null

  const [videos, jobs] = await Promise.all([getVideos(), getJobs()])

  const videoMap = new Map(videos.map((v) => [v.id, v]))
  const completedJobs = jobs.filter((j) => j.status === "completed")
  const totalTimeSaved = completedJobs.reduce((acc, job) => {
    const video = videoMap.get(job.video_id)
    const original = video?.duration_seconds ?? 0
    const processed = job.output_duration_seconds ?? original
    return acc + Math.max(0, original - processed)
  }, 0)

  const recentJobs = jobs.slice(0, 5)

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

      {/* Stats Row */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Card
          className="animate-fade-in"
          style={{ animationDelay: "0ms", animationFillMode: "both" }}
        >
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Videos</CardTitle>
            <Film className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">{videos.length}</p>
          </CardContent>
        </Card>

        <Card
          className="animate-fade-in"
          style={{ animationDelay: "100ms", animationFillMode: "both" }}
        >
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Processed</CardTitle>
            <CheckCircle className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">{completedJobs.length}</p>
          </CardContent>
        </Card>

        <Card
          className="animate-fade-in"
          style={{ animationDelay: "200ms", animationFillMode: "both" }}
        >
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Time Saved</CardTitle>
            <Clock className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">{Math.round(totalTimeSaved)}s</p>
          </CardContent>
        </Card>

        <Card
          className="animate-fade-in"
          style={{ animationDelay: "300ms", animationFillMode: "both" }}
        >
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Plan</CardTitle>
            <CreditCard className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="flex items-center gap-2">
              <Badge
                variant={profile.tier === "pro" ? "default" : "secondary"}
              >
                {profile.tier.toUpperCase()}
              </Badge>
              {profile.tier === "free" && (
                <Link
                  href="/pricing"
                  className="text-xs text-primary hover:underline"
                >
                  Upgrade
                </Link>
              )}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Recent Activity + Quick Actions */}
      <div className="grid gap-4 sm:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Recent Activity</CardTitle>
            <CardDescription>Your latest processing jobs</CardDescription>
          </CardHeader>
          <CardContent>
            {recentJobs.length === 0 ? (
              <p className="text-sm text-muted-foreground">No activity yet.</p>
            ) : (
              <div className="space-y-3">
                {recentJobs.map((job) => {
                  const video = videoMap.get(job.video_id)
                  return (
                    <div
                      key={job.id}
                      className="flex items-center justify-between text-sm"
                    >
                      <span className="line-clamp-1 flex-1">
                        {video?.original_filename ?? "Unknown video"}
                      </span>
                      <div className="ml-2 flex items-center gap-2">
                        <Badge
                          variant={
                            job.status === "completed"
                              ? "default"
                              : job.status === "failed"
                                ? "destructive"
                                : "secondary"
                          }
                        >
                          {job.status}
                        </Badge>
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Quick Actions</CardTitle>
            <CardDescription>Jump right in</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-3">
            <Button
              variant="outline"
              nativeButton={false}
              render={<Link href="/videos" />}
              className="justify-start"
            >
              <Upload className="mr-2 h-4 w-4" />
              Upload New Video
            </Button>
            <Button
              variant="outline"
              nativeButton={false}
              render={<Link href="/history" />}
              className="justify-start"
            >
              <History className="mr-2 h-4 w-4" />
              View History
            </Button>
            {profile.tier === "free" ? (
              <Button
                variant="outline"
                nativeButton={false}
                render={<Link href="/pricing" />}
                className="justify-start"
              >
                <Sparkles className="mr-2 h-4 w-4" />
                Upgrade to Pro
              </Button>
            ) : (
              <Button
                variant="outline"
                nativeButton={false}
                render={<Link href="/dashboard/profile" />}
                className="justify-start"
              >
                <CreditCard className="mr-2 h-4 w-4" />
                Manage Subscription
              </Button>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
