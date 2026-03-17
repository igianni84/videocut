# Authentication & User Management

## Overview

VideoCut uses Supabase Auth with three sign-in methods: **magic link (email OTP)**, **Google OAuth**, and **Apple OAuth**. All auth state is managed server-side via `@supabase/ssr`, with middleware handling session refresh and route protection.

---

## Auth Flow

### Magic Link

1. User enters email on `/login`
2. Server Action `signInWithMagicLink()` calls `supabase.auth.signInWithOtp()`
3. Supabase sends email with link pointing to `/auth/callback?code=...`
4. Callback route exchanges code for session via `exchangeCodeForSession()`
5. User redirected to `/dashboard`

### OAuth (Google / Apple)

1. User clicks "Continue with Google/Apple" on `/login`
2. Server Action `signInWithOAuth()` initiates OAuth flow
3. User authenticates with provider
4. Provider redirects to `/auth/callback?code=...`
5. Callback route exchanges code for session
6. User redirected to `/dashboard`

### Sign Out

- `signOut()` Server Action calls `supabase.auth.signOut()` and redirects to `/login`

---

## Route Protection

### Middleware (`middleware.ts` → `lib/supabase/middleware.ts`)

Every request passes through middleware that:

1. **Refreshes the session** — calls `supabase.auth.getUser()` to keep tokens valid
2. **Enforces access rules:**

| Route | Rule |
|-------|------|
| `/`, `/login`, `/auth/callback` | Public — no auth required |
| `/dashboard/*`, `/profile/*` | Protected — unauthenticated users redirected to `/login?next=[path]` |
| `/login` (when authenticated) | Redirected to `/dashboard` |
| API routes | Pass through (no redirect) |

### Matcher

Middleware runs on all routes except static assets (`_next/static`, `_next/image`, `favicon.ico`, etc.).

---

## Session Management

- **Refresh:** Automatic on every request via middleware `updateSession()`
- **Token rotation:** Handled by Supabase SSR SDK (transparent)
- **Cookies:** Managed via Next.js `cookies()` API in `createServerClient()`
- **Browser client:** `createBrowserClient()` for Client Components (minimal usage — most auth is server-side)

---

## Profile Management

### Auto-creation

A PostgreSQL trigger (`handle_new_user`) fires on `auth.users` INSERT and creates a `profiles` row with:
- `id` = auth user ID
- `email` from auth
- `full_name`, `avatar_url` from OAuth metadata (if available)
- `tier` = `'free'` (default)

### Editable Fields

- `full_name` — text input
- `preferred_language` — dropdown (IT, EN, ES, FR, DE, PT)

### Read-only Display

- Email, tier, subscription status, member since date

---

## RLS Policies

All tables enforce Row Level Security. Users can only access their own data.

### `profiles`

| Policy | Rule |
|--------|------|
| SELECT own | `auth.uid() = id` |
| UPDATE own | `auth.uid() = id` |

### `videos`

| Policy | Rule |
|--------|------|
| SELECT/INSERT/DELETE own | `auth.uid() = user_id` |
| Service role | Full access |

### `jobs`

| Policy | Rule |
|--------|------|
| SELECT/INSERT own | `auth.uid() = user_id` |
| Service role | Full access |

### `subscription_events`

| Policy | Rule |
|--------|------|
| Service role only | No direct user access (audit trail) |

### Storage Buckets

| Bucket | User access | Service role |
|--------|-------------|-------------|
| `originals` | Upload/read own folder | Full access |
| `processed` | Read own folder | Full access |

---

## Key Files

| File | Purpose |
|------|---------|
| `lib/auth/actions.ts` | Server Actions: signIn, signOut, updateProfile, getProfile |
| `lib/auth/types.ts` | TypeScript types: Profile, OAuthProvider, AuthResult |
| `lib/supabase/server.ts` | Server-side Supabase client |
| `lib/supabase/client.ts` | Browser-side Supabase client |
| `lib/supabase/middleware.ts` | Session refresh + route protection logic |
| `middleware.ts` | Root middleware entry point |
| `app/(auth)/login/page.tsx` | Login page |
| `app/auth/callback/route.ts` | OAuth/magic link callback handler |
| `app/(dashboard)/layout.tsx` | Protected layout with auth guard |
| `app/(dashboard)/dashboard/page.tsx` | Dashboard page |
| `app/(dashboard)/profile/page.tsx` | Profile page |
| `components/auth/LoginForm.tsx` | Login form (magic link + OAuth buttons) |
| `components/auth/ProfileForm.tsx` | Profile edit form |
| `components/auth/UserNav.tsx` | User avatar + sign-out in header |

---

## Environment Variables

| Variable | Usage |
|----------|-------|
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Public API key (safe for client) |
| `NEXT_PUBLIC_APP_URL` | Used in magic link redirect URL |
