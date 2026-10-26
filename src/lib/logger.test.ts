import { describe, expect, it } from 'vitest'
import { redactString, SENSITIVE_KEY_RE } from './logger.js'

describe('logger redaction', () => {
  it('masks LINE user ids and Bearer tokens in free text', () => {
    const out = redactString('user U1234567890abcdef1234567890abcdef sent Bearer abc.def.ghi')
    expect(out).not.toContain('1234567890abcdef1234567890abc')
    expect(out).toContain('U***cdef')
    expect(out).toContain('Bearer [REDACTED]')
  })

  it('treats token, secret and user id keys as sensitive', () => {
    for (const k of ['lineUserId', 'line_user_id', 'idToken', 'access_token', 'channelSecret', 'authorization', 'displayName']) {
      expect(SENSITIVE_KEY_RE.test(k)).toBe(true)
    }
    expect(SENSITIVE_KEY_RE.test('count')).toBe(false)
  })
})
