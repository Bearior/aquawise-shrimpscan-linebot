/**
 * What `pnpm db:smoke` checks, read only: the farms by how they were made,
 * that the OA's own settings table is there, and that the daily quota RPC
 * answers (for a random farm id, so no farm's quota is touched or shown).
 * Every line is a count or a word: never a farm id, a LINE id or a key.
 */

import { randomUUID } from 'node:crypto'

type DbError = { message: string; code?: string } | null

/** The part of a Supabase client the checks use. */
export interface SmokeDb {
  from(table: string): { select(columns: string, options?: { count: 'exact'; head: true }): PromiseLike<{ data?: unknown; count?: number | null; error: DbError }> }
  rpc(fn: string, args: Record<string, unknown>): PromiseLike<{ data?: unknown; error: DbError }>
}

const PROJECTS: Record<string, string> = { gydtpgeequcfbrvgubso: 'prod', jysoyhdvnqgnvrlfsisk: 'staging' }
const NONE = '(none)'

/** Which of the two projects SUPABASE_URL points at, without printing the URL. */
export function dbLabel(url: string): string {
  const ref = /^https:\/\/([a-z0-9]+)\.supabase\.co\/?$/.exec(url.trim())?.[1]
  return (ref && PROJECTS[ref]) || 'another database'
}

const line = (name: string, says: string) => `${name.padEnd(27)}${says}`
const failed = (e: NonNullable<DbError>) => `FAILED: ${e.message}${e.code ? ` (${e.code})` : ''}`

export async function smokeChecks(db: SmokeDb, limit: number): Promise<{ ok: boolean; lines: string[] }> {
  let ok = true
  const lines: string[] = []

  const farms = await db.from('farms').select('created_via')
  if (farms.error) {
    ok = false
    lines.push(line('farms', failed(farms.error)))
  } else {
    const by = new Map<string, number>()
    for (const f of (farms.data ?? []) as Array<{ created_via?: string | null }>) {
      const k = f.created_via || NONE
      by.set(k, (by.get(k) ?? 0) + 1)
    }
    // Most first; farms that say nothing last.
    const counts = [...by].sort(([a, n], [b, m]) => (a === NONE ? 1 : b === NONE ? -1 : m - n || a.localeCompare(b)))
    lines.push(line('farms', counts.map(([k, n]) => `${k} ${n}`).join(' · ') || 'none'))
  }

  const settings = await db.from('shrimp_scan_farm_settings').select('farm_id', { count: 'exact', head: true })
  if (settings.error) {
    ok = false
    lines.push(line('shrimp_scan_farm_settings', failed(settings.error)))
  } else lines.push(line('shrimp_scan_farm_settings', `there, ${settings.count ?? 0} rows`))

  const quota = await db.rpc('sizing_quota_status', { p_farm_id: randomUUID(), p_limit: limit })
  const row = (Array.isArray(quota.data) ? quota.data[0] : quota.data) as { remaining?: unknown } | null | undefined
  if (quota.error || typeof row?.remaining !== 'number') {
    ok = false
    lines.push(line('sizing_quota_status', quota.error ? failed(quota.error) : 'FAILED: no remaining count'))
  } else lines.push(line('sizing_quota_status', `answers: ${row.remaining} of ${limit} left for a farm with no scans`))

  return { ok, lines }
}
