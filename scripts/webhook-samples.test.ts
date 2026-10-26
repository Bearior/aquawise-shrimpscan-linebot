import { describe, expect, it } from 'vitest'
import { buildSamples } from './webhook-samples.js'
import { validateLineSignature } from '../src/lib/line/client.js'

describe('webhook samples', () => {
  it('signs the good samples with the secret and the last one with a wrong secret', () => {
    process.env.LINE_CHANNEL_SECRET = 'sample-secret'
    const [follow, text, bad] = buildSamples('sample-secret')
    expect(validateLineSignature(follow!.body, follow!.signature)).toBe(true)
    expect(validateLineSignature(text!.body, text!.signature)).toBe(true)
    expect(validateLineSignature(bad!.body, bad!.signature)).toBe(false)
    expect(bad!.expect).toBe(403)
    delete process.env.LINE_CHANNEL_SECRET
  })
})
