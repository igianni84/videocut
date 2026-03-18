import { createClient } from "@supabase/supabase-js"

import type { Database } from "@/types/database.types"

/**
 * Service-role Supabase client for internal server-side operations
 * that need to bypass RLS (e.g., updating job/video status).
 *
 * NEVER expose this client to the browser.
 */
export function createAdminClient() {
  return createClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
}
