import crypto from 'node:crypto'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { lineConfigured, validateLineSignature } from './client.js'

const SECRET = 'test-channel-secret'
const sign = (body: string, secret = SECRET) => crypto.createHmac('sha256', secret).update(body).digest('base64')

describe('validateLineSignature', () => {
  const saved = process.env.LINE_CHANNEL_SECRET
  beforeEach(() => {
    process.env.LINE_CHANNEL_SECRET = SECRET
  })
  afterEach(() => {
    if (saved === undefined) delete process.env.LINE_CHANNEL_SECRET
    else process.env.LINE_CHANNEL_SECRET = saved
  })

  it('accepts the right signature, as a string or a Buffer', () => {
    const body = '{"events":[]}'
    expect(validateLineSignature(body, sign(body))).toBe(true)
    expect(validateLineSignature(Buffer.from(body), sign(body))).toBe(true)
  })

  it('rejects a signature made with another secret', () => {
    const body = '{"events":[]}'
    expect(validateLineSignature(body, sign(body, 'other-secret'))).toBe(false)
  })

  it('rejects a body changed after signing', () => {
    expect(validateLineSignature('{"events":[1]}', sign('{"events":[]}'))).toBe(false)
  })

  it('rejects an empty signature and one of the wrong length without throwing', () => {
    expect(validateLineSignature('{}', '')).toBe(false)
    expect(validateLineSignature('{}', 'c2hvcnQ=')).toBe(false)
  })

  it('throws when the channel secret is unset (callers check it first)', () => {
    delete process.env.LINE_CHANNEL_SECRET
    expect(() => validateLineSignature('{}', 'x')).toThrow(/LINE_CHANNEL_SECRET/)
  })
})

describe('lineConfigured', () => {
  const s = process.env.LINE_CHANNEL_SECRET
  const t = process.env.LINE_CHANNEL_ACCESS_TOKEN
  afterEach(() => {
    if (s === undefined) delete process.env.LINE_CHANNEL_SECRET
    else process.env.LINE_CHANNEL_SECRET = s
    if (t === undefined) delete process.env.LINE_CHANNEL_ACCESS_TOKEN
    else process.env.LINE_CHANNEL_ACCESS_TOKEN = t
  })

  it('needs both the secret and the access token', () => {
    process.env.LINE_CHANNEL_SECRET = 'a'
    delete process.env.LINE_CHANNEL_ACCESS_TOKEN
    expect(lineConfigured()).toBe(false)
    process.env.LINE_CHANNEL_ACCESS_TOKEN = 'b'
    expect(lineConfigured()).toBe(true)
  })
})
