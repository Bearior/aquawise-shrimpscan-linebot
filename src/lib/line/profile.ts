import { lineConfigured } from './client.js'

/** LINE's profile picture: an https URL on LINE's own hosts, or nothing. */
export function linePicture(raw: unknown): string | undefined {
  if (typeof raw !== 'string' || raw.length > 500) return undefined
  try {
    const u = new URL(raw)
    return u.protocol === 'https:' && /(^|\.)line-scdn\.net$|(^|\.)line\.me$/.test(u.hostname) ? u.href : undefined
  } catch {
    return undefined
  }
}

/** One quick try: the people list waits on it. */
const BOT_PROFILE_TIMEOUT_MS = 3_000

/**
 * A person's LINE picture as the OA sees it (`GET /v2/bot/profile/{userId}`,
 * like line-bot's คนในฟาร์ม `resolveProfiles`). LINE answers only for someone
 * who has the OA as a friend; anyone else, a person with no picture, LINE not
 * configured, or a slow or unhappy LINE is undefined. Never throws.
 */
export async function botProfilePicture(lineUserId: string): Promise<string | undefined> {
  if (!lineConfigured()) return undefined
  try {
    const res = await fetch(`https://api.line.me/v2/bot/profile/${encodeURIComponent(lineUserId)}`, {
      headers: { Authorization: `Bearer ${process.env.LINE_CHANNEL_ACCESS_TOKEN}` },
      signal: AbortSignal.timeout(BOT_PROFILE_TIMEOUT_MS),
    })
    if (!res.ok) return undefined
    return linePicture(((await res.json()) as { pictureUrl?: unknown }).pictureUrl)
  } catch {
    return undefined
  }
}
