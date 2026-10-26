/**
 * Which LINE Official Account does this token belong to?
 *
 *   LINE_CHANNEL_TARGET=staging pnpm line:whoami
 *
 * Calls GET https://api.line.me/v2/bot/info with LINE_CHANNEL_ACCESS_TOKEN and
 * prints the OA's basicId and displayName (never the token). Refuses to run
 * without LINE_CHANNEL_TARGET, so you always say which channel you meant and
 * can compare it with what LINE answers.
 */
import { requireSafeTarget } from '../src/lib/line/safety.js'

if (!process.env.K_SERVICE) {
  try {
    ;(await import('dotenv')).config()
  } catch {}
}

const target = requireSafeTarget({ mutating: false, allowProd: false })
const token = process.env.LINE_CHANNEL_ACCESS_TOKEN
if (!token) {
  console.error('LINE_CHANNEL_ACCESS_TOKEN is unset.')
  process.exit(1)
}

const res = await fetch('https://api.line.me/v2/bot/info', {
  headers: { Authorization: `Bearer ${token}` },
  signal: AbortSignal.timeout(10_000),
})
if (!res.ok) {
  console.error(`LINE answered ${res.status}. The token is wrong, revoked, or not a Messaging API token.`)
  process.exit(1)
}
const info = (await res.json()) as { basicId?: string; displayName?: string; chatMode?: string }
console.log(`LINE_CHANNEL_TARGET  ${target}`)
console.log(`basicId              ${info.basicId ?? '?'}`)
console.log(`displayName          ${info.displayName ?? '?'}`)
console.log(`chatMode             ${info.chatMode ?? '?'}`)
