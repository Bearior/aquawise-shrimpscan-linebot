import type { messagingApi } from '@line/bot-sdk'
import { logger } from '../lib/logger.js'
import { TH } from '../copy/th.js'

type Message = messagingApi.Message

/** A 4xx from the LINE API (an expired or used reply token lands here). */
export function isLineApiError(error: unknown): boolean {
  if (error && typeof error === 'object') {
    const err = error as { statusCode?: number; status?: number; message?: string }
    const code = err.statusCode ?? err.status
    if (code !== undefined && code >= 400 && code < 500) return true
    if (err.message && err.message.includes('status code 4')) return true
  }
  return false
}

/** The text of every text message, for the push fallback. */
export function extractTextFromMessages(messages: Message[]): string | null {
  const texts = messages.filter((m): m is messagingApi.TextMessage => m.type === 'text').map((m) => m.text)
  return texts.length > 0 ? texts.join('\n') : null
}

/**
 * Reply, and push instead when the reply token failed (ported from line-bot).
 * A reply token can be used once; even a failed reply consumes it.
 */
export async function safeReply(
  client: Pick<messagingApi.MessagingApiClient, 'replyMessage' | 'pushMessage'>,
  replyToken: string,
  targetId: string,
  messages: Message[],
): Promise<'replied' | 'pushed'> {
  try {
    await client.replyMessage({ replyToken, messages })
    return 'replied'
  } catch (error) {
    if (!isLineApiError(error)) throw error
    logger.error('replyMessage failed, using pushMessage', { error: String(error) })
    // Push the original messages; a template or Flex that failed to reply can
    // still push. If the push itself fails, fall back to plain text.
    try {
      await client.pushMessage({ to: targetId, messages })
    } catch {
      const text = extractTextFromMessages(messages) ?? TH.error
      await client.pushMessage({ to: targetId, messages: [{ type: 'text', text }] })
    }
    return 'pushed'
  }
}
