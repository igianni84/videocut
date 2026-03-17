import { redirect } from "next/navigation"

import { getProfile } from "@/lib/auth/actions"
import { ProfileForm } from "@/components/auth/ProfileForm"

export const metadata = {
  title: "Profile — VideoCut",
}

export default async function ProfilePage() {
  const profile = await getProfile()

  if (!profile) {
    redirect("/login")
  }

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold">Profile</h1>
        <p className="text-muted-foreground">Manage your account settings</p>
      </div>

      <ProfileForm profile={profile} />
    </div>
  )
}
