import type { messagingApi, webhook } from '@line/bot-sdk'
import { TH } from '../copy/th.js'
import { getLineClient } from '../lib/line/client.js'
import { logger } from '../lib/logger.js'
import { safeReply } from './safe-reply.js'

type Message = messagingApi.Message
type LineClient = Pick<messagingApi.MessagingApiClient, 'replyMessage' | 'pushMessage'>

/** `https://liff.line.me/<LIFF_ID>`, or null while LIFF_ID is unset. */
export function liffUrl(): string | null {
  const id = process.env.LIFF_ID?.trim()
  return id ? `https://liff.line.me/${id}` : null
}

/** A text body with one button that opens the LIFF; plain text when there is no LIFF yet. */
export function textWithLiffButton(text: string, label: string): Message {
  const uri = liffUrl()
  if (!uri) return { type: 'text', text }
  return {
    type: 'template',
    altText: text,
    template: { type: 'buttons', text, actions: [{ type: 'uri', label, uri }] },
  }
}

/** What the skeleton answers. null = ignore the event. */
export function replyFor(event: webhook.Event): Message[] | null {
  if (event.type === 'follow') return [textWithLiffButton(TH.greeting, TH.greetingButton)]
  if (event.type === 'message' && event.message.type === 'text') {
    return [textWithLiffButton(TH.placeholder, TH.placeholderButton)]
  }
  return null
}

function sourceId(event: webhook.Event): string | null {
  const s = event.source
  if (!s) return null
  if (s.type === 'user') return s.userId ?? null
  if (s.type === 'group') return s.groupId
  if (s.type === 'room') return s.roomId
  return null
}

/** Handle one webhook body's events. Runs after the 200 has been sent. */
export async function handleWebhookEvents(events: webhook.Event[], client: LineClient = getLineClient()): Promise<void> {
  for (const event of events) {
    const messages = replyFor(event)
    if (!messages) continue
    const replyToken = 'replyToken' in event ? event.replyToken : undefined
    const target = sourceId(event)
    if (!replyToken || !target) continue
    try {
      await safeReply(client, replyToken, target, messages)
    } catch (error) {
      logger.error('webhook reply failed', { type: event.type, error: String(error) })
    }
  }
}
