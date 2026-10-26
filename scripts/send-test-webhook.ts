/**
 * Send signed sample events to a webhook, then one with a bad signature.
 *
 *   LINE_CHANNEL_SECRET=<the secret of that service> pnpm webhook:test http://localhost:3000/webhook
 *
 * Expects 200, 200, 403. The events use a made-up user and reply token, so a
 * real server answers 200 and then fails to reply (LINE rejects the token);
 * that failure is logged, and it is what you want: nothing reaches a person.
 */
import { buildSamples } from './webhook-samples.js'

if (!process.env.K_SERVICE) {
  try {
    ;(await import('dotenv')).config()
  } catch {}
}

const url = process.argv[2]
const secret = process.env.LINE_CHANNEL_SECRET
if (!url) {
  console.error('usage: send-test-webhook.ts <webhook url>')
  process.exit(2)
}
if (!secret) {
  console.error('LINE_CHANNEL_SECRET is unset: it signs the test events.')
  process.exit(2)
}

let failed = 0
for (const s of buildSamples(secret)) {
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-line-signature': s.signature },
    body: s.body,
    signal: AbortSignal.timeout(10_000),
  })
  const ok = res.status === s.expect
  if (!ok) failed++
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${s.name.padEnd(14)} expected ${s.expect}, got ${res.status}`)
}
if (failed) process.exit(1)


