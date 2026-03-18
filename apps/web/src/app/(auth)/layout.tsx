import { Film, Scissors, Type, Gauge } from "lucide-react"

export default function AuthLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <div className="flex min-h-screen bg-zinc-50 dark:bg-zinc-950">
      {/* Left panel — hidden on mobile */}
      <div className="hidden lg:flex lg:w-1/2 lg:flex-col lg:items-center lg:justify-center border-r bg-gradient-to-br from-primary/5 via-primary/10 to-primary/5 px-12">
        <div className="max-w-sm">
          <div className="flex items-center gap-2">
            <Film className="h-8 w-8 text-primary" />
            <span className="text-2xl font-bold">VideoCut</span>
          </div>
          <p className="mt-4 text-lg text-muted-foreground">
            Automate your video editing — powered by AI.
          </p>
          <ul className="mt-8 space-y-4">
            <li className="flex items-start gap-3">
              <Scissors className="mt-0.5 h-5 w-5 shrink-0 text-primary" />
              <span className="text-sm text-muted-foreground">
                Smart pause and silence removal for tighter content
              </span>
            </li>
            <li className="flex items-start gap-3">
              <Type className="mt-0.5 h-5 w-5 shrink-0 text-primary" />
              <span className="text-sm text-muted-foreground">
                Dynamic word-by-word subtitles in 6 languages
              </span>
            </li>
            <li className="flex items-start gap-3">
              <Gauge className="mt-0.5 h-5 w-5 shrink-0 text-primary" />
              <span className="text-sm text-muted-foreground">
                Speed control and one-click platform reformatting
              </span>
            </li>
          </ul>
        </div>
      </div>

      {/* Right panel — form */}
      <div className="flex flex-1 items-center justify-center px-4">
        <div className="w-full max-w-sm">{children}</div>
      </div>
    </div>
  )
}
