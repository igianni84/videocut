import { Film } from "lucide-react"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { LoginForm } from "@/components/auth/LoginForm"

export const metadata = {
  title: "Login — VideoCut",
}

export default async function LoginPage(props: {
  searchParams: Promise<{ error?: string; message?: string }>
}) {
  const searchParams = await props.searchParams

  return (
    <div className="flex flex-col gap-6">
      <div className="text-center">
        <div className="flex items-center justify-center gap-2">
          <Film className="h-6 w-6 text-primary" />
          <h1 className="text-2xl font-bold tracking-tight">VideoCut</h1>
        </div>
        <p className="mt-1 text-sm text-muted-foreground">
          Sign in to start editing
        </p>
      </div>

      {searchParams.error && (
        <Alert variant="destructive">
          <AlertDescription>
            {searchParams.error === "auth_callback_error"
              ? "Authentication failed. Please try again."
              : searchParams.error}
          </AlertDescription>
        </Alert>
      )}

      {searchParams.message && (
        <Alert>
          <AlertDescription>{searchParams.message}</AlertDescription>
        </Alert>
      )}

      <LoginForm />
    </div>
  )
}
