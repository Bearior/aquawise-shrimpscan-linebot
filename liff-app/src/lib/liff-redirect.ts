/**
 * Where the `/liff/` entry sends a page load.
 *
 * LINE opens the LIFF endpoint (`/liff/`) and passes the real target as
 * `?liff.state=<path and query>`: a rich-menu tile is
 * `https://liff.line.me/<LIFF_ID>/app/scan`, so liff.state is `/app/scan`, and
 * an invite link is `https://liff.line.me/<LIFF_ID>/app/join?invite=7K2P9QX`.
 *
 * Rule (from line-bot's two lost-invite bugs): forward what arrived. Only paths
 * under `/app` are honoured, so liff.state can never send the app somewhere
 * outside its own shell.
 */

/**
 * Is this load LINE's OAuth callback, with the one-time code still in the URL?
 * `liff.init()` reads that code off window.location, so the entry must NOT
 * navigate away until LIFF has booted (line-bot's ~1.4s login loop).
 */
export function isPendingLiffOAuthCallback(searchParams: URLSearchParams): boolean {
  if (!searchParams.get('code')) return false
  return searchParams.has('state') || searchParams.has('liffClientId') || searchParams.has('liffRedirectUri')
}

export function resolveDefaultRedirect(searchParams: URLSearchParams): string {
  const liffState = searchParams.get('liff.state')
  let path = '/app'
  let query: URLSearchParams = searchParams

  if (liffState) {
    const qIdx = liffState.indexOf('?')
    const rawPath = qIdx >= 0 ? liffState.slice(0, qIdx) : liffState
    // A path-only liff.state ("/app/scan") has an empty query, not a "?/app" key.
    query = new URLSearchParams(qIdx >= 0 ? liffState.slice(qIdx + 1) : '')
    const clean = rawPath.replace(/\/+$/, '')
    if (clean === '/app' || clean.startsWith('/app/')) path = clean
  } else {
    // No liff.state: keep the app's own params (an invite `code`), drop LINE's.
    query = new URLSearchParams()
    for (const [k, v] of searchParams) {
      if (!LINE_PARAMS.has(k)) query.append(k, v)
    }
    // A bare invite on the endpoint goes to the join screen. The invite param is
    // `invite`, never `code`: `code` is LINE's one-time OAuth code.
    if (query.has('invite')) path = '/app/join'
  }

  const qs = query.toString()
  return `/liff${path}${qs ? `?${qs}` : ''}`
}

const LINE_PARAMS = new Set([
  'code',
  'state',
  'error',
  'error_description',
  'liffClientId',
  'liffRedirectUri',
  'liffToken',
  'liff.referrer',
  'is_light',
  '_liffRetry',
])
