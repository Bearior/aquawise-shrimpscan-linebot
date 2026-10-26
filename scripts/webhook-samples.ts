import crypto from 'node:crypto'

export function signBody(body: string, secret: string): string {
  return crypto.createHmac('sha256', secret).update(body).digest('base64')
}

const source = { type: 'user', userId: 'U00000000000000000000000000000000' }
const base = { mode: 'active', timestamp: 0, deliveryContext: { isRedelivery: false } }

/** A follow, a text, then the text again with a signature made from the wrong secret. */
export function buildSamples(secret: string): { name: string; body: string; signature: string; expect: number }[] {
  const follow = JSON.stringify({
    destination: 'Utest',
    events: [{ ...base, type: 'follow', webhookEventId: 'test-follow', replyToken: '00000000000000000000000000000000', source }],
  })
  const text = JSON.stringify({
    destination: 'Utest',
    events: [{ ...base, type: 'message', webhookEventId: 'test-text', replyToken: '11111111111111111111111111111111', source, message: { type: 'text', id: '1', text: 'ทดสอบ', quoteToken: 'q' } }],
  })
  return [
    { name: 'follow', body: follow, signature: signBody(follow, secret), expect: 200 },
    { name: 'text', body: text, signature: signBody(text, secret), expect: 200 },
    { name: 'bad signature', body: text, signature: signBody(text, secret + '-wrong'), expect: 403 },
  ]
}
