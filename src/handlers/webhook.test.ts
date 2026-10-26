import { afterEach, describe, expect, it, vi } from 'vitest'
import type { webhook } from '@line/bot-sdk'
import { handleWebhookEvents, replyFor } from './webhook.js'
import { TH } from '../copy/th.js'

const savedLiff = process.env.LIFF_ID
afterEach(() => {
  if (savedLiff === undefined) delete process.env.LIFF_ID
  else process.env.LIFF_ID = savedLiff
})

const user = { type: 'user', userId: 'U1234567890abcdef1234567890abcdef' } as const
const follow = { type: 'follow', replyToken: 'rt-follow', source: user, timestamp: 0, mode: 'active', webhookEventId: 'a', deliveryContext: { isRedelivery: false } } as unknown as webhook.Event
const text = { type: 'message', replyToken: 'rt-text', source: user, message: { type: 'text', id: '1', text: 'สวัสดี', quoteToken: 'q' }, timestamp: 0, mode: 'active', webhookEventId: 'b', deliveryContext: { isRedelivery: false } } as unknown as webhook.Event
const sticker = { type: 'message', replyToken: 'rt-st', source: user, message: { type: 'sticker', id: '2', packageId: '1', stickerId: '1' }, timestamp: 0, mode: 'active', webhookEventId: 'c', deliveryContext: { isRedelivery: false } } as unknown as webhook.Event
const unfollow = { type: 'unfollow', source: user, timestamp: 0, mode: 'active', webhookEventId: 'd', deliveryContext: { isRedelivery: false } } as unknown as webhook.Event

describe('replyFor', () => {
  it('follow gets the greeting with a LIFF button when LIFF_ID is set', () => {
    process.env.LIFF_ID = '2000000000-abcdefgh'
    const [m] = replyFor(follow)!
    expect(m).toMatchObject({ type: 'template', template: { type: 'buttons', text: TH.greeting } })
    expect(JSON.stringify(m)).toContain('https://liff.line.me/2000000000-abcdefgh')
  })

  it('text gets the placeholder; plain text while LIFF_ID is unset', () => {
    delete process.env.LIFF_ID
    expect(replyFor(text)).toEqual([{ type: 'text', text: TH.placeholder }])
  })

  it('ignores every other event', () => {
    expect(replyFor(sticker)).toBeNull()
    expect(replyFor(unfollow)).toBeNull()
  })

  it('keeps the buttons template text inside LINE\'s 160 characters', () => {
    expect(TH.greeting.length).toBeLessThanOrEqual(160)
    expect(TH.placeholder.length).toBeLessThanOrEqual(160)
  })
})

describe('handleWebhookEvents', () => {
  it('replies once per answered event and skips the rest', async () => {
    const client = { replyMessage: vi.fn().mockResolvedValue({}), pushMessage: vi.fn() }
    await handleWebhookEvents([follow, sticker, text, unfollow], client as never)
    expect(client.replyMessage).toHaveBeenCalledTimes(2)
    expect(client.replyMessage.mock.calls.map((c) => c[0].replyToken)).toEqual(['rt-follow', 'rt-text'])
    expect(client.pushMessage).not.toHaveBeenCalled()
  })

  it('one failing event does not stop the next', async () => {
    const client = {
      replyMessage: vi.fn().mockRejectedValueOnce(new Error('network down')).mockResolvedValue({}),
      pushMessage: vi.fn(),
    }
    await handleWebhookEvents([follow, text], client as never)
    expect(client.replyMessage).toHaveBeenCalledTimes(2)
  })
})
