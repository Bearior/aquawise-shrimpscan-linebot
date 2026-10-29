/**
 * The one Supabase client: the service role, server side only.
 *
 * The database is the one น้องน้ำ uses (one LINE provider, so one person has
 * one LINE id in both bots). For now the staging deployment points at PROD
 * (Bear, 2026-10-29), and the routes write only to farms this OA created
 * (`src/data/context.ts`).
 *
 * Null when SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY is unset: the routes
 * answer 503 db_not_configured instead of crashing, like the LINE secrets.
 */

import { createClient, type SupabaseClient } from '@supabase/supabase-js'

let cached: { key: string; client: SupabaseClient } | null = null

export function getDb(): SupabaseClient | null {
  const url = process.env.SUPABASE_URL?.trim()
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim()
  if (!url || !key) return null
  const id = `${url} ${key}`
  if (cached?.key !== id) {
    cached = { key: id, client: createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } }) }
  }
  return cached.client
}
