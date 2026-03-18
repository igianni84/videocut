import { NextResponse } from "next/server"
import { Resend } from "resend"

const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? "https://videocut.app"

function getResend() {
  const key = process.env.RESEND_API_KEY
  if (!key) {
    throw new Error("RESEND_API_KEY is not configured")
  }
  return new Resend(key)
}

export async function POST(request: Request) {
  // Authenticate via processing API key
  const apiKey = request.headers.get("x-api-key")
  if (!apiKey || apiKey !== process.env.PROCESSING_API_KEY) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const body = await request.json()
  const { jobId, userEmail, videoName } = body as {
    jobId: string
    userEmail: string
    videoName: string
  }

  if (!jobId || !userEmail || !videoName) {
    return NextResponse.json({ error: "Missing required fields" }, { status: 400 })
  }

  try {
    await getResend().emails.send({
      from: "VideoCut <notifications@videocut.app>",
      to: userEmail,
      subject: `Your video "${videoName}" is ready!`,
      html: `
        <div style="font-family: sans-serif; max-width: 480px; margin: 0 auto;">
          <h2>Your video is ready!</h2>
          <p>Great news — <strong>${videoName}</strong> has finished processing.</p>
          <p>
            <a href="${APP_URL}/videos" style="display: inline-block; padding: 10px 20px; background: #18181b; color: white; text-decoration: none; border-radius: 6px;">
              View your video
            </a>
          </p>
          <p style="color: #71717a; font-size: 13px; margin-top: 24px;">
            Processed videos are available for 30 days.
          </p>
        </div>
      `,
    })

    return NextResponse.json({ success: true })
  } catch (err) {
    console.error("Failed to send notification email:", err)
    return NextResponse.json({ error: "Failed to send email" }, { status: 500 })
  }
}
