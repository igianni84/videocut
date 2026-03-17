import { redirect } from "next/navigation"

import { getProfile } from "@/lib/auth/actions"
import { UserNav } from "@/components/auth/UserNav"

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const profile = await getProfile()

  if (!profile) {
    redirect("/login")
  }

  return (
    <div className="min-h-screen bg-zinc-50 dark:bg-zinc-950">
      <header className="border-b bg-white dark:bg-zinc-900">
        <div className="mx-auto flex h-14 max-w-5xl items-center justify-between px-6">
          <div className="flex items-center gap-6">
            <span className="text-lg font-semibold">VideoCut</span>
            <nav className="flex items-center gap-4 text-sm">
              <a
                href="/dashboard"
                className="text-foreground hover:text-foreground/80"
              >
                Dashboard
              </a>
              <a
                href="/profile"
                className="text-muted-foreground hover:text-foreground"
              >
                Profile
              </a>
            </nav>
          </div>
          <UserNav profile={profile} />
        </div>
      </header>
      <main className="mx-auto max-w-5xl px-6 py-8">{children}</main>
    </div>
  )
}
