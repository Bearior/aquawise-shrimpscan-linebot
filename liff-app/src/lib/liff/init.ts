import liff from '@line/liff'
import { fetchLiffConfig } from './liff-config'

async function resolveLiffId(): Promise<string | undefined> {
  // A build-time VITE_LIFF_ID is a dev convenience. Deployed bundles read the id
  // at runtime, so staging and prod run the SAME bundle.
  const buildTime = import.meta.env.VITE_LIFF_ID as string | undefined
  if (buildTime) return buildTime
  const cfg = await fetchLiffConfig()
  return cfg?.liffId || undefined
}

/**
 * Boot the LIFF SDK once. Resolves `true` after `liff.init()`, `false` when no
 * LIFF id could be resolved (the app then runs without the SDK).
 *
 * Memoised on purpose (line-bot): two inits racing for the same single-use
 * authorization code can leave the loser convinced nobody is logged in.
 */
let booted: Promise<boolean> | null = null

/**
 * Drop LINE's credential fragment (#access_token=...&id_token=...) from the
 * address bar once init has read it. The fragment only: `liff.state` is a
 * query param and carries the deep-link target.
 */
function dropCredentialFragment(): void {
  try {
    const hash = window.location.hash
    if (!hash || !/(access_token|id_token|context_token|feature_token)=/.test(hash)) return
    window.history.replaceState(window.history.state, '', window.location.pathname + window.location.search)
  } catch {
    /* A cosmetic cleanup must never break boot. */
  }
}

export function initLiff(): Promise<boolean> {
  if (booted) return booted

  booted = (async () => {
    const liffId = await resolveLiffId()
    if (!liffId) {
      console.warn('[LIFF] No LIFF id (VITE_LIFF_ID unset and /api/liff-config empty); running without LIFF')
      return false
    }
    await liff.init({ liffId })
    dropCredentialFragment()
    return true
  })()

  // A failed init must not be sticky: the next mount may retry.
  void booted.catch(() => {
    booted = null
  })

  return booted
}

/** Tests only. */
export function __resetInitLiff(): void {
  booted = null
}
