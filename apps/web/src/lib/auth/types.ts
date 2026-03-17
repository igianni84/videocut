import type { Database } from "@/types/database.types"

export type Profile = Database["public"]["Tables"]["profiles"]["Row"]
export type ProfileUpdate = Database["public"]["Tables"]["profiles"]["Update"]

export type OAuthProvider = "google" | "apple"

export type AuthResult = {
  success: boolean
  data?: unknown
  error?: string
}
