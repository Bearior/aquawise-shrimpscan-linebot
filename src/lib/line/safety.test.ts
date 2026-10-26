import { afterEach, describe, expect, it } from 'vitest'
import { requireSafeTarget } from './safety.js'

const saved = process.env.LINE_CHANNEL_TARGET
afterEach(() => {
  if (saved === undefined) delete process.env.LINE_CHANNEL_TARGET
  else process.env.LINE_CHANNEL_TARGET = saved
})

describe('requireSafeTarget', () => {
  it('refuses when LINE_CHANNEL_TARGET is unset or unknown', () => {
    delete process.env.LINE_CHANNEL_TARGET
    expect(() => requireSafeTarget({ mutating: false, allowProd: false })).toThrow(/required/)
    process.env.LINE_CHANNEL_TARGET = 'production'
    expect(() => requireSafeTarget({ mutating: false, allowProd: false })).toThrow(/must be/)
  })

  it('allows staging, and prod for reads', () => {
    process.env.LINE_CHANNEL_TARGET = 'staging'
    expect(requireSafeTarget({ mutating: true, allowProd: false })).toBe('staging')
    process.env.LINE_CHANNEL_TARGET = 'prod'
    expect(requireSafeTarget({ mutating: false, allowProd: false })).toBe('prod')
  })

  it('needs --allow-prod to change the prod channel', () => {
    process.env.LINE_CHANNEL_TARGET = 'prod'
    expect(() => requireSafeTarget({ mutating: true, allowProd: false })).toThrow(/allow-prod/)
    expect(requireSafeTarget({ mutating: true, allowProd: true })).toBe('prod')
  })
})
