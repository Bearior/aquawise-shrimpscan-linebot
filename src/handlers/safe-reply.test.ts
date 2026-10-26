import { describe, expect, it, vi } from 'vitest'
import { extractTextFromMessages, isLineApiError, safeReply } from './safe-reply.js'
import { TH } from '../copy/th.js'

describe('isLineApiError', () => {
  it('is true for a 4xx and false otherwise', () => {
    expect(isLineApiError({ status: 400 })).toBe(true)
    expect(isLineApiError({ statusCode: 410 })).toBe(true)
    expect(isLineApiError({ status: 500 })).toBe(false)
    expect(isLineApiError(new Error('boom'))).toBe(false)
  })
})

describe('extractTextFromMessages', () => {
  it('joins text messages and ignores the rest', () => {
    expect(extractTextFromMessages([{ type: 'text', text: 'a' }, { type: 'sticker', packageId: '1', stickerId: '1' }, { type: 'text', text: 'b' }])).toBe('a\nb')
    expect(extractTextFromMessages([{ type: 'sticker', packageId: '1', stickerId: '1' }])).toBeNull()
  })
})

describe('safeReply', () => {
  const msgs = [{ type: 'text' as const, text: 'hello' }]

  it('replies when the token works', async () => {
    const client = { replyMessage: vi.fn().mockResolvedValue({}), pushMessage: vi.fn() }
    expect(await safeReply(client as never, 'rt', 'U1', msgs)).toBe('replied')
    expect(client.pushMessage).not.toHaveBeenCalled()
  })

  it('pushes the same messages when the reply token fails with a 4xx', async () => {
    const client = { replyMessage: vi.fn().mockRejectedValue({ status: 400 }), pushMessage: vi.fn().mockResolvedValue({}) }
    expect(await safeReply(client as never, 'rt', 'U1', msgs)).toBe('pushed')
    expect(client.pushMessage).toHaveBeenCalledWith({ to: 'U1', messages: msgs })
  })

  it('falls back to the generic text when even the push of a non-text message fails', async () => {
    const tmpl = [{ type: 'template' as const, altText: 'x', template: { type: 'buttons' as const, text: 'x', actions: [] } }]
    const client = {
      replyMessage: vi.fn().mockRejectedValue({ status: 400 }),
      pushMessage: vi.fn().mockRejectedValueOnce({ status: 400 }).mockResolvedValue({}),
    }
    await safeReply(client as never, 'rt', 'U1', tmpl as never)
    expect(client.pushMessage).toHaveBeenLastCalledWith({ to: 'U1', messages: [{ type: 'text', text: TH.error }] })
  })

  it('rethrows an error that is not a LINE 4xx', async () => {
    const client = { replyMessage: vi.fn().mockRejectedValue(new Error('network')), pushMessage: vi.fn() }
    await expect(safeReply(client as never, 'rt', 'U1', msgs)).rejects.toThrow('network')
  })
})
