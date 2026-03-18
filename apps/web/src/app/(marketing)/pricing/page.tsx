import Link from "next/link"

import { getProfile } from "@/lib/auth/actions"
import { Button } from "@/components/ui/button"
import { PricingCards } from "@/components/billing/PricingCards"

export const metadata = {
  title: "Pricing — VideoCut",
}

export default async function PricingPage() {
  const profile = await getProfile()

  return (
    <div className="flex min-h-screen flex-col bg-zinc-50 dark:bg-zinc-950">
      {/* Nav */}
      <header className="border-b px-6 py-4">
        <div className="mx-auto flex max-w-5xl items-center justify-between">
          <Link href="/" className="text-lg font-semibold">
            VideoCut
          </Link>
          {profile ? (
            <Button
              size="sm"
              variant="outline"
              nativeButton={false}
              render={<Link href="/dashboard" />}
            >
              Dashboard
            </Button>
          ) : (
            <Button
              size="sm"
              nativeButton={false}
              render={<Link href="/login" />}
            >
              Sign In
            </Button>
          )}
        </div>
      </header>

      {/* Pricing Section */}
      <main className="flex flex-1 flex-col items-center px-6 py-16">
        <h1 className="text-center text-4xl font-bold tracking-tight">
          Simple, Transparent Pricing
        </h1>
        <p className="mt-4 text-center text-lg text-muted-foreground">
          Start free, upgrade when you need more.
        </p>

        <div className="mt-12 w-full max-w-3xl">
          <PricingCards
            currentTier={profile?.tier ?? null}
            isLoggedIn={!!profile}
          />
        </div>
      </main>

      {/* Footer */}
      <footer className="border-t px-6 py-8">
        <div className="mx-auto flex max-w-5xl items-center justify-between">
          <span className="text-sm font-semibold">VideoCut</span>
          <p className="text-xs text-muted-foreground">
            Automate your video editing.
          </p>
        </div>
      </footer>
    </div>
  )
}
