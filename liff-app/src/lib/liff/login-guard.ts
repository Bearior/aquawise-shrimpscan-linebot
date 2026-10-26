/**
 * Self-healing LIFF login guard (ported from line-bot).
 *
 * The LINE in-app webview can hold a poisoned login state where
 * `liff.isLoggedIn()` stays false, and a naive `if (!isLoggedIn) liff.login()`
 * then bounces to access.line.me and back forever.
 *
 * The guard tries login at most once: if we come back STILL logged out, that
 * is the loop, so we `liff.logout()` and tell the caller to render instead.
 *
 * The authority is the URL marker, because storage did not survive LINE's
 * cross-origin round trip in line-bot's field reports: `cleanHref(true)` puts
 * `_liffRetry=1` on the redirectUri, and finding it on load proves we have been
 * round once. localStorage is a second opinion only.
 */
import liff from '@line/liff'

const ATTEMPTS_KEY = 'aw_scan_liff_login_attempts'
const RETRY_PARAM = '_liffRetry'
const MAX_ATTEMPTS = 1
/** Long enough to span the OAuth round trip, short enough to never stick. */
const GUARD_TTL_MS = 3 * 60 * 1000

let actedThisLoad = false

/** Params LINE itself appends; the app's own params (an invite code) survive. */
const OAUTH_PARAMS = new Set([
  'code',
  'state',
  'error',
  'error_description',
  'error_uri',
  'liffClientId',
  'liffRedirectUri',
  'liffToken',
  'liff.referrer',
  'is_light',
])

export function cleanHref(href: string, withRetryMarker = false): string {
  try {
    const url = new URL(href)
    for (const key of [...url.searchParams.keys()]) {
      if (OAUTH_PARAMS.has(key)) url.searchParams.delete(key)
    }
    if (withRetryMarker) url.searchParams.set(RETRY_PARAM, '1')
    url.hash = ''
    return url.toString()
  } catch {
    return href
  }
}

export function hasRetryMarker(): boolean {
  try {
    return new URLSearchParams(window.location.search).has(RETRY_PARAM)
  } catch {
    return false
  }
}

/** Take the marker back out once login has worked: this URL can be shared. */
export function stripRetryMarker(): void {
  try {
    if (!hasRetryMarker()) return
    const url = new URL(window.location.href)
    url.searchParams.delete(RETRY_PARAM)
    window.history.replaceState(null, '', url.toString())
  } catch {
    /* a tidy URL is never worth throwing over */
  }
}

export function readGuardCounter(key: string): number {
  try {
    const raw = localStorage.getItem(key)
    if (!raw) return 0
    const parsed = JSON.parse(raw) as { n?: number; ts?: number }
    if (typeof parsed.n !== 'number' || typeof parsed.ts !== 'number') return 0
    if (Date.now() - parsed.ts > GUARD_TTL_MS) return 0
    return parsed.n
  } catch {
    return 0
  }
}

export function writeGuardCounter(key: string, n: number): void {
  try {
    localStorage.setItem(key, JSON.stringify({ n, ts: Date.now() }))
  } catch {
    /* localStorage unavailable: degrade to the in-memory flag */
  }
}

export function clearGuardCounter(key: string): void {
  try {
    localStorage.removeItem(key)
  } catch {
    /* ignore */
  }
}

/** True the first time within the TTL (and records it), false after. */
export function consumeOnceWithinTtl(key: string): boolean {
  if (readGuardCounter(key) >= 1) return false
  writeGuardCounter(key, 1)
  return true
}

export function resetLoginGuard(): void {
  actedThisLoad = false
  clearGuardCounter(ATTEMPTS_KEY)
}

/**
 * Call when `liff.isLoggedIn()` is false.
 * - 'redirecting': a login redirect was started (or already was this load).
 * - 'recovered': we already went round once; the bad state was cleared and the
 *   caller should render instead of redirecting again.
 */
export function attemptLoginOrRecover(): 'redirecting' | 'recovered' {
  if (actedThisLoad) return 'redirecting'

  if (hasRetryMarker() || readGuardCounter(ATTEMPTS_KEY) >= MAX_ATTEMPTS) {
    try {
      liff.logout()
    } catch {
      /* ignore */
    }
    resetLoginGuard()
    actedThisLoad = true
    return 'recovered'
  }

  actedThisLoad = true
  writeGuardCounter(ATTEMPTS_KEY, readGuardCounter(ATTEMPTS_KEY) + 1)
  liff.login({ redirectUri: cleanHref(window.location.href, true) })
  return 'redirecting'
}
