import Link from "next/link"

import { Button } from "@/components/ui/button"

export default function Home() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-zinc-50 dark:bg-zinc-950">
      <main className="flex flex-col items-center gap-8 px-6 text-center">
        <h1 className="text-4xl font-bold tracking-tight sm:text-5xl">
          VideoCut
        </h1>
        <p className="max-w-md text-lg text-muted-foreground">
          Automate your video editing. Remove pauses, add dynamic subtitles,
          and more — powered by AI.
        </p>
        <Button size="lg" render={<Link href="/login" />}>
          Get Started
        </Button>
      </main>
    </div>
  )
}
