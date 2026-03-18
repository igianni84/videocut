import Link from "next/link"
import { Scissors, Type, Gauge, Crop } from "lucide-react"

import { Button } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"

const features = [
  {
    icon: Scissors,
    title: "Smart Pause Removal",
    description:
      "Automatically detect and remove silences and pauses for tighter, more engaging content.",
  },
  {
    icon: Type,
    title: "Dynamic Subtitles",
    description:
      "Word-by-word highlighted subtitles that keep your audience hooked.",
  },
  {
    icon: Gauge,
    title: "Speed Control",
    description:
      "Intelligent speed adjustments that maintain natural speech while cutting dead air.",
  },
  {
    icon: Crop,
    title: "Smart Crop & Format",
    description:
      "One-click reformat for TikTok, Reels, Shorts, or any platform.",
  },
]

const steps = [
  {
    number: "1",
    title: "Upload",
    description: "Drop your video file — MP4, MOV, or WebM up to 500 MB.",
  },
  {
    number: "2",
    title: "Configure",
    description:
      "Choose subtitles, speed, format, and filler removal settings.",
  },
  {
    number: "3",
    title: "Download",
    description: "Get your polished video in minutes, ready to publish.",
  },
]

export default function Home() {
  return (
    <div className="flex min-h-screen flex-col bg-zinc-50 dark:bg-zinc-950">
      {/* Hero */}
      <section className="flex flex-1 flex-col items-center justify-center px-6 py-20 text-center">
        <h1 className="animate-fade-in-up max-w-3xl text-4xl font-bold tracking-tight sm:text-5xl lg:text-6xl">
          Edit Videos in Minutes,{" "}
          <span className="text-primary">Not Hours</span>
        </h1>
        <p
          className="animate-fade-in-up mt-6 max-w-xl text-lg text-muted-foreground"
          style={{ animationDelay: "100ms", animationFillMode: "both" }}
        >
          Remove pauses, add dynamic subtitles, control speed, and reformat —
          all powered by AI. No editing skills required.
        </p>
        <div
          className="animate-fade-in-up mt-8 flex flex-wrap items-center justify-center gap-4"
          style={{ animationDelay: "200ms", animationFillMode: "both" }}
        >
          <Button
            size="lg"
            nativeButton={false}
            render={<Link href="/login" />}
          >
            Get Started Free
          </Button>
          <Button
            size="lg"
            variant="outline"
            nativeButton={false}
            render={<a href="#features" />}
          >
            See How It Works
          </Button>
        </div>

        {/* Visual placeholder — simulated timeline */}
        <div
          className="animate-fade-in-up mt-16 w-full max-w-2xl"
          style={{ animationDelay: "300ms", animationFillMode: "both" }}
        >
          <div className="flex aspect-video items-center justify-center rounded-xl border bg-gradient-to-br from-primary/10 via-primary/5 to-transparent shadow-lg">
            <div className="flex items-center gap-3">
              <div className="h-1 w-8 rounded-full bg-primary/30" />
              <div className="h-1 w-16 rounded-full bg-primary/50" />
              <div className="h-1 w-6 rounded-full bg-primary/20" />
              <div className="h-1 w-12 rounded-full bg-primary/40" />
              <div className="h-1 w-10 rounded-full bg-primary/30" />
              <div className="h-1 w-20 rounded-full bg-primary/60" />
            </div>
          </div>
        </div>
      </section>

      {/* Features */}
      <section
        id="features"
        className="border-t bg-white px-6 py-20 dark:bg-zinc-900"
      >
        <div className="mx-auto max-w-5xl">
          <h2 className="text-center text-3xl font-bold tracking-tight">
            Everything You Need
          </h2>
          <p className="mt-3 text-center text-muted-foreground">
            Professional video editing, simplified.
          </p>
          <div className="mt-12 grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
            {features.map((feature, i) => (
              <Card
                key={feature.title}
                className="animate-fade-in-up"
                style={{
                  animationDelay: `${i * 100}ms`,
                  animationFillMode: "both",
                }}
              >
                <CardHeader>
                  <feature.icon className="h-8 w-8 text-primary" />
                  <CardTitle className="text-base">{feature.title}</CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-sm text-muted-foreground">
                    {feature.description}
                  </p>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      </section>

      {/* How It Works */}
      <section className="px-6 py-20">
        <div className="mx-auto max-w-3xl">
          <h2 className="text-center text-3xl font-bold tracking-tight">
            How It Works
          </h2>
          <div className="mt-12 grid gap-8 sm:grid-cols-3">
            {steps.map((step, i) => (
              <div
                key={step.number}
                className="animate-fade-in-up flex flex-col items-center text-center"
                style={{
                  animationDelay: `${i * 150}ms`,
                  animationFillMode: "both",
                }}
              >
                <div className="flex h-12 w-12 items-center justify-center rounded-full bg-primary text-lg font-bold text-primary-foreground">
                  {step.number}
                </div>
                <h3 className="mt-4 font-semibold">{step.title}</h3>
                <p className="mt-2 text-sm text-muted-foreground">
                  {step.description}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

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
