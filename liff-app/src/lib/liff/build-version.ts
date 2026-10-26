/**
 * Stale-bundle self-heal (ported from line-bot). LINE caches the LIFF bundle
 * hard, so after a deploy a farmer can keep running an old build. The baked
 * build id is compared with the server's `/api/liff-config` build_id; on a
 * mismatch we reload ONCE, guarded by a 10-minute stamp, so it can never loop.
 * Never touch /liff cache headers instead: no-store on the document loops the
 * LINE login.
 */
import { fetchLiffConfig } from './liff-config'

const RELOAD_KEY = 'aw_scan_liff_build_reload'
const RELOAD_TTL_MS = 10 * 60 * 1000

export function bakedBuildId(): string {
  const id = (import.meta.env.VITE_BUILD_ID as string | undefined)?.trim()
  return id || 'dev'
}

function reloadAllowed(): boolean {
  try {
    const raw = localStorage.getItem(RELOAD_KEY)
    if (raw) {
      const parsed = JSON.parse(raw) as { ts?: number }
      if (typeof parsed.ts === 'number' && Date.now() - parsed.ts < RELOAD_TTL_MS) return false
    }
  } catch {
    /* localStorage unavailable: allow the single reload */
  }
  return true
}

function stampReload(): void {
  try {
    localStorage.setItem(RELOAD_KEY, JSON.stringify({ ts: Date.now() }))
  } catch {
    /* ignore */
  }
}

export type BuildFreshness = 'reloading' | 'fresh' | 'skipped' | 'unknown'

export async function checkBuildFreshness(deps?: {
  fetchFn?: typeof fetch
  reload?: () => void
  baked?: string
}): Promise<BuildFreshness> {
  const baked = deps?.baked ?? bakedBuildId()
  if (baked === 'dev') return 'unknown'
  const reload = deps?.reload ?? (() => window.location.reload())

  let serverId: string
  try {
    const body = deps?.fetchFn
      ? await (async () => {
          const res = await deps.fetchFn!('/api/liff-config', { cache: 'no-store' })
          if (!res.ok) return null
          return (await res.json()) as { build_id?: string }
        })()
      : await fetchLiffConfig()
    if (!body) return 'unknown'
    serverId = body.build_id ?? ''
  } catch {
    return 'unknown'
  }

  if (!serverId || serverId === 'unknown') return 'unknown'
  if (serverId === baked) return 'fresh'
  if (!reloadAllowed()) return 'skipped'
  stampReload()
  reload()
  return 'reloading'
}
