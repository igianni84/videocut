"use client"

import { useState } from "react"
import { Download, Loader2 } from "lucide-react"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"

type DownloadButtonProps = {
  videoId: string
  filename: string
  size?: "sm" | "default" | "icon"
  variant?: "default" | "outline" | "ghost" | "secondary"
}

export function DownloadButton({
  videoId,
  filename,
  size = "sm",
  variant = "outline",
}: DownloadButtonProps) {
  const [loading, setLoading] = useState(false)

  const handleDownload = async () => {
    setLoading(true)
    try {
      const res = await fetch(`/api/videos/${videoId}/download`)
      if (!res.ok) {
        throw new Error("Failed to get download URL")
      }

      const { downloadUrl, filename: serverFilename } = await res.json()
      const finalFilename = serverFilename ?? filename

      // Trigger browser download via temporary anchor
      const a = document.createElement("a")
      a.href = downloadUrl
      a.download = finalFilename
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      toast.success("Download started!")
    } catch {
      toast.error("Download failed. Please try again.")
    } finally {
      setLoading(false)
    }
  }

  return (
    <Button
      size={size}
      variant={variant}
      disabled={loading}
      onClick={handleDownload}
    >
      {loading ? (
        <Loader2 className="mr-1 h-3 w-3 animate-spin" />
      ) : (
        <Download className="mr-1 h-3 w-3" />
      )}
      Download
    </Button>
  )
}
