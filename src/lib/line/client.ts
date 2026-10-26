import crypto from 'node:crypto'
import { messagingApi } from '@line/bot-sdk'

/**
 * Is LINE configured for this process? The server boots without the LINE
 * secrets on purpose (the first deploy happens before the channels exist), so
 * every LINE path asks this first instead of crashing at boot.
 */
export function lineConfigured(): boolean {
  return Boolean(process.env.LINE_CHANNEL_SECRET && process.env.LINE_CHANNEL_ACCESS_TOKEN)
}

/**
 * Verify LINE's `x-line-signature` against the raw request body.
 * HMAC-SHA256 with the channel secret, base64, compared in constant time.
 * Ported from line-bot `src/lib/line/client.ts`.
 */
export function validateLineSignature(body: string | Buffer, signature: string): boolean {
  const channelSecret = process.env.LINE_CHANNEL_SECRET
  if (!channelSecret) throw new Error('Missing LINE_CHANNEL_SECRET')
  if (!signature) return false

  const expected = crypto.createHmac('sha256', channelSecret).update(body).digest()

  let provided: Buffer
  try {
    provided = Buffer.from(signature, 'base64')
  } catch {
    return false
  }

  // timingSafeEqual throws on a length mismatch; an unequal length is already
  // an invalid signature, and the length of a SHA-256 digest is public.
  if (provided.length !== expected.length) return false
  return crypto.timingSafeEqual(provided, expected)
}

let client: messagingApi.MessagingApiClient | null = null

/** The Messaging API client, created on first use (needs the access token). */
export function getLineClient(): messagingApi.MessagingApiClient {
  const channelAccessToken = process.env.LINE_CHANNEL_ACCESS_TOKEN
  if (!channelAccessToken) throw new Error('Missing LINE_CHANNEL_ACCESS_TOKEN')
  if (!client) client = new messagingApi.MessagingApiClient({ channelAccessToken })
  return client
}

/** Tests only. */
export function __resetLineClient(): void {
  client = null
}
