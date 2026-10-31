import type { Request, Response, NextFunction } from 'express'
import crypto from 'node:crypto'
import { deployedAs } from '../lib/deployed.js'
import { linePicture } from '../lib/line/profile.js'
import { logger } from '../lib/logger.js'

/**
 * LIFF token verification, ported from line-bot `src/middleware/liff-auth.ts`
 * without its platform-access gate.
 *
 * The verified LINE user id lands in `req.lineUserId`. It is the ONLY identity
 * the server trusts: a request body never carries a user id. The LINE display
 * name rides along in `req.lineDisplayName` (a name to show, never a key).
 */

// Extend Express Request to carry the verified LINE user ID
// eslint-disable-next-line @typescript-eslint/no-namespace
declare global { namespace Express { interface Request { lineUserId?: string; lineDisplayName?: string; linePictureUrl?: string } } }

/** Who LINE says signed in: the user id, and the display name and picture when LINE gave them. */
export interface LiffIdentity {
  userId: string
  name?: string
  pictureUrl?: string
}

/** A display name worth keeping: trimmed, never blank. */
function nameOf(raw: unknown): string | undefined {
  return typeof raw === 'string' && raw.trim() ? raw.trim() : undefined
}

// 5-minute cache keyed by SHA-256 of the token (never stores the raw token).
const CACHE_TTL_MS = 5 * 60 * 1000
const verifyCache = new Map<string, LiffIdentity & { expiresAt: number }>()

function tokenHash(token: string): string {
  return crypto.createHash('sha256').update(token).digest('hex')
}

function pruneCacheEntry(key: string): void {
  const entry = verifyCache.get(key)
  if (entry && entry.expiresAt < Date.now()) verifyCache.delete(key)
}

/** LINE ID tokens are JWTs (three dot-separated segments). Access tokens are opaque. */
function looksLikeIdToken(token: string): boolean {
  return token.split('.').length === 3
}

/**
 * Comma-separated allow-list of LINE Login channel ids whose LIFF tokens we
 * accept. Falls back to the singular `LIFF_CHANNEL_ID`.
 */
export function liffChannelAllowList(): string[] {
  const plural = process.env['LIFF_CHANNEL_IDS']
  if (plural) return plural.split(',').map((id) => id.trim()).filter(Boolean)
  const singular = process.env['LIFF_CHANNEL_ID']?.trim()
  return singular ? [singular] : []
}

/** Read a JWT's `aud` without verifying it, only to pick which channel id to
 * ask LINE about. LINE's `/oauth2/v2.1/verify` does the real check. */
function decodeJwtAud(token: string): string | undefined {
  try {
    const payloadSegment = token.split('.')[1]
    if (!payloadSegment) return undefined
    const payload = JSON.parse(Buffer.from(payloadSegment, 'base64url').toString('utf8')) as { aud?: string }
    return payload.aud
  } catch {
    return undefined
  }
}

/**
 * 8s per hop. One request can chain three LINE calls (id-token verify, then
 * access-token verify, then profile); unbounded, a slow LINE leaves the LIFF
 * on a spinner for minutes. Failing fast gives the client a clean 401.
 */
const LINE_VERIFY_TIMEOUT_MS = 8_000

async function verifyIdToken(token: string, liffChannelId: string): Promise<LiffIdentity> {
  const params = new URLSearchParams({ id_token: token, client_id: liffChannelId })
  const res = await fetch('https://api.line.me/oauth2/v2.1/verify', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: params.toString(),
    signal: AbortSignal.timeout(LINE_VERIFY_TIMEOUT_MS),
  })
  if (!res.ok) throw new Error(`LINE id-token verify failed: ${res.status}`)
  // `name` and `picture` are in the payload when the LIFF has the profile scope.
  const payload = (await res.json()) as { sub?: string; name?: string; picture?: string; error?: string }
  if (payload.error || !payload.sub) throw new Error(payload.error || 'Missing sub in id-token payload')
  return { userId: payload.sub, name: nameOf(payload.name), pictureUrl: linePicture(payload.picture) }
}

/**
 * Access-token flow: the token's `client_id` must be one of our Login
 * channels, then `/v2/profile` gives the user id. Works even when the LIFF app
 * lacks the `openid` scope.
 */
async function verifyAccessToken(token: string, allowList: string[]): Promise<LiffIdentity> {
  const verifyRes = await fetch(`https://api.line.me/oauth2/v2.1/verify?access_token=${encodeURIComponent(token)}`, {
    signal: AbortSignal.timeout(LINE_VERIFY_TIMEOUT_MS),
  })
  if (!verifyRes.ok) throw new Error(`LINE access-token verify failed: ${verifyRes.status}`)
  const verifyPayload = (await verifyRes.json()) as { client_id?: string; error?: string }
  if (verifyPayload.error) throw new Error(verifyPayload.error)
  if (!verifyPayload.client_id || !allowList.includes(verifyPayload.client_id)) {
    throw new Error(`access-token client_id not in allow-list (got ${verifyPayload.client_id})`)
  }

  const profileRes = await fetch('https://api.line.me/v2/profile', {
    headers: { Authorization: `Bearer ${token}` },
    signal: AbortSignal.timeout(LINE_VERIFY_TIMEOUT_MS),
  })
  if (!profileRes.ok) throw new Error(`LINE profile fetch failed: ${profileRes.status}`)
  const profile = (await profileRes.json()) as { userId?: string; displayName?: string; pictureUrl?: string }
  if (!profile.userId) throw new Error('Missing userId in profile response')
  return { userId: profile.userId, name: nameOf(profile.displayName), pictureUrl: linePicture(profile.pictureUrl) }
}

async function verifyWithLine(token: string): Promise<LiffIdentity> {
  const allowList = liffChannelAllowList()
  if (allowList.length === 0) throw new Error('LIFF_CHANNEL_IDS/LIFF_CHANNEL_ID env var not configured')

  // Prefer the ID token when it looks like a JWT; fall back to the
  // access-token flow so the LIFF still works without the `openid` scope.
  if (looksLikeIdToken(token)) {
    const aud = decodeJwtAud(token)
    const clientId = aud && allowList.includes(aud) ? aud : allowList[0]
    try {
      return await verifyIdToken(token, clientId!)
    } catch (err) {
      logger.warn('[liff-auth] id-token verify failed, trying access-token:', err instanceof Error ? err.message : err)
    }
  }
  return verifyAccessToken(token, allowList)
}

/** Verify a LIFF token. The raw token is never logged or kept; the cache is
 * keyed by its SHA-256 digest. */
export async function verifyLiffIdentity(token: string): Promise<LiffIdentity> {
  const key = tokenHash(token)
  pruneCacheEntry(key)
  const cached = verifyCache.get(key)
  if (cached && cached.expiresAt > Date.now()) return { userId: cached.userId, name: cached.name, pictureUrl: cached.pictureUrl }

  const who = await verifyWithLine(token)
  verifyCache.set(key, { ...who, expiresAt: Date.now() + CACHE_TTL_MS })
  return who
}

/** The verified LINE user id alone. */
export async function verifyLiffToken(token: string): Promise<string> {
  return (await verifyLiffIdentity(token)).userId
}

/**
 * Dev-only auth bypass for the local LIFF harness. Kept exactly as line-bot
 * has it.
 *
 * Unreachable unless ALL of these hold: `deployedAs()` is null (not on Cloud
 * Run, not on Railway), `NODE_ENV !== 'production'`, `ALLOW_DEV_LIFF_AUTH ===
 * 'true'` and `LIFF_DEV_USER_ID` is set. `deployedAs()` is the load-bearing
 * term: `NODE_ENV !== 'production'` is TRUE on staging, which is public, so
 * NODE_ENV alone is not an "am I deployed" test.
 *
 * When active, `Authorization: Bearer dev-liff` (the sentinel the local LIFF
 * build sends from `VITE_DEV_LIFF_TOKEN`) is attributed to `LIFF_DEV_USER_ID`.
 */
function devAuthBypass(req: Request): string | null {
  if (deployedAs()) return null
  if (process.env['NODE_ENV'] === 'production') return null
  // Opt-in by its own name, so no other variable can turn auth off by accident.
  if (process.env['ALLOW_DEV_LIFF_AUTH'] !== 'true') return null
  const devUser = process.env['LIFF_DEV_USER_ID']
  if (!devUser) return null
  if (req.headers['authorization'] === 'Bearer dev-liff') return devUser
  return null
}

/**
 * Refuse to boot a deployed revision that carries the dev-auth variables.
 * `devAuthBypass` already ignores them there; this makes the mistake fail at
 * deploy time instead of sitting in the environment unexplained.
 */
export function assertNoDevAuthInDeployedEnv(): void {
  const service = deployedAs()
  if (!service) return
  if (!process.env['LIFF_DEV_USER_ID'] && process.env['ALLOW_DEV_LIFF_AUTH'] !== 'true') return
  throw new Error(
    '[liff-auth] REFUSING TO START: LIFF_DEV_USER_ID / ALLOW_DEV_LIFF_AUTH are set on a ' +
      `deployed service (${service}). The dev auth bypass is unreachable there by ` +
      'design; remove both variables from the service.',
  )
}

/**
 * Every `/api/liff/*` route passes through here.
 *
 * With no LIFF channel configured (the first deploy, before the LINE Login
 * channel exists) it answers 503 `liff_not_configured` instead of a 401 that
 * would read as "your login is broken".
 */
export async function verifyLiffIdToken(req: Request, res: Response, next: NextFunction): Promise<void> {
  const devUserId = devAuthBypass(req)
  if (devUserId) {
    logger.warn('[liff-auth] DEV AUTH BYPASS active, attributing request to the dev user')
    req.lineUserId = devUserId
    next()
    return
  }

  if (liffChannelAllowList().length === 0) {
    res.status(503).json({ error: 'liff_not_configured' })
    return
  }

  const authHeader = req.headers['authorization']
  if (!authHeader?.startsWith('Bearer ')) {
    // "No token" and "bad token" are told apart so a broken flow is easy to place.
    res.status(401).json({ error: 'Missing LIFF token', reason: 'no_authorization_header' })
    return
  }

  try {
    const who = await verifyLiffIdentity(authHeader.slice(7))
    req.lineUserId = who.userId
    req.lineDisplayName = who.name
    req.linePictureUrl = who.pictureUrl
  } catch (err) {
    const reason = err instanceof Error ? err.message : 'verify_failed'
    logger.warn('[liff-auth] verify failed:', reason)
    res.status(401).json({ error: 'Invalid LIFF token', reason })
    return
  }
  next()
}
