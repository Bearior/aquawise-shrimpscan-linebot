import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { verifyLiffToken, verifyLiffIdToken, assertNoDevAuthInDeployedEnv } from './liff-auth.js'

/** A minimal unsigned JWT with the given `aud`. verifyWithLine only reads the
 * payload's `aud` locally; LINE's endpoint (mocked) does the real check. */
function fakeIdToken(aud: string, salt = ''): string {
  const header = Buffer.from(JSON.stringify({ alg: 'RS256' })).toString('base64url')
  const payload = Buffer.from(JSON.stringify({ aud, sub: 'Uabc123', salt })).toString('base64url')
  return `${header}.${payload}.sig`
}

// Restore KEY BY KEY: replacing process.env swaps the object identity.
const KEYS = [
  'K_SERVICE', 'RAILWAY_SERVICE_NAME', 'NODE_ENV', 'ALLOW_DEV_LIFF_AUTH', 'LIFF_DEV_USER_ID', 'LIFF_CHANNEL_ID', 'LIFF_CHANNEL_IDS',
  'RAILWAY_PROJECT_ID', 'RAILWAY_ENVIRONMENT_ID', 'RAILWAY_SERVICE_ID',
] as const
const saved: Record<string, string | undefined> = {}
for (const k of KEYS) saved[k] = process.env[k]
const originalFetch = global.fetch

function restoreEnv(): void {
  for (const k of KEYS) {
    const v = saved[k]
    if (v === undefined) delete process.env[k]
    else process.env[k] = v
  }
}

describe('verifyLiffToken: channel allow-list', () => {
  beforeEach(() => {
    delete process.env.LIFF_CHANNEL_ID
    delete process.env.LIFF_CHANNEL_IDS
  })
  afterEach(() => {
    restoreEnv()
    global.fetch = originalFetch
    vi.restoreAllMocks()
  })

  it('singular LIFF_CHANNEL_ID verifies an ID token', async () => {
    process.env.LIFF_CHANNEL_ID = 'login-channel'
    global.fetch = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ sub: 'Uabc123' }) }) as never
    expect(await verifyLiffToken(fakeIdToken('login-channel', 'a'))).toBe('Uabc123')
  })

  it('verifies against the channel named in aud when it is in LIFF_CHANNEL_IDS', async () => {
    process.env.LIFF_CHANNEL_IDS = 'first-channel,second-channel'
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ sub: 'Uabc123' }) })
    global.fetch = fetchMock as never
    expect(await verifyLiffToken(fakeIdToken('second-channel', 'b'))).toBe('Uabc123')
    const body = (fetchMock.mock.calls[0]?.[1] as { body: string }).body
    expect(new URLSearchParams(body).get('client_id')).toBe('second-channel')
  })

  it('access-token path: client_id must be in the allow-list, then /v2/profile', async () => {
    process.env.LIFF_CHANNEL_IDS = 'first-channel,second-channel'
    global.fetch = vi.fn().mockImplementation((url: string) => {
      if (url.includes('/v2.1/verify?access_token=')) {
        return Promise.resolve({ ok: true, json: async () => ({ client_id: 'second-channel' }) })
      }
      if (url.includes('/v2/profile')) return Promise.resolve({ ok: true, json: async () => ({ userId: 'Uabc123' }) })
      throw new Error(`unexpected fetch: ${url}`)
    }) as never
    // Opaque token (no dots) forces the access-token path. Distinct token per
    // test: the cache is keyed by token hash.
    expect(await verifyLiffToken('opaque-access-token-1')).toBe('Uabc123')
  })

  it('access-token path: rejects a client_id outside the allow-list', async () => {
    process.env.LIFF_CHANNEL_IDS = 'first-channel'
    global.fetch = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ client_id: 'some-other-channel' }) }) as never
    await expect(verifyLiffToken('opaque-access-token-2')).rejects.toThrow(/not in allow-list/)
  })

  it('falls back to the access-token path when the ID token is rejected', async () => {
    process.env.LIFF_CHANNEL_ID = 'login-channel'
    global.fetch = vi.fn().mockImplementation((url: string) => {
      if (url === 'https://api.line.me/oauth2/v2.1/verify') return Promise.resolve({ ok: false, status: 400 })
      if (url.includes('/v2.1/verify?access_token=')) {
        return Promise.resolve({ ok: true, json: async () => ({ client_id: 'login-channel' }) })
      }
      if (url.includes('/v2/profile')) return Promise.resolve({ ok: true, json: async () => ({ userId: 'Ufallback' }) })
      throw new Error(`unexpected fetch: ${url}`)
    }) as never
    expect(await verifyLiffToken(fakeIdToken('login-channel', 'c'))).toBe('Ufallback')
  })

  it('caches a verified token, so LINE is asked once', async () => {
    process.env.LIFF_CHANNEL_ID = 'login-channel'
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ sub: 'Ucached' }) })
    global.fetch = fetchMock as never
    const token = fakeIdToken('login-channel', 'cache')
    await verifyLiffToken(token)
    await verifyLiffToken(token)
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('throws when neither LIFF_CHANNEL_ID nor LIFF_CHANNEL_IDS is set', async () => {
    await expect(verifyLiffToken('opaque-access-token-3')).rejects.toThrow(/not configured/)
  })
})

function fakeRes() {
  const res = {
    statusCode: 200,
    body: undefined as unknown,
    status(code: number) {
      res.statusCode = code
      return res
    },
    json(b: unknown) {
      res.body = b
      return res
    },
  }
  return res
}

describe('verifyLiffIdToken middleware', () => {
  afterEach(() => {
    restoreEnv()
    global.fetch = originalFetch
  })

  it('answers 503 liff_not_configured when no Login channel is set', async () => {
    delete process.env.LIFF_CHANNEL_ID
    delete process.env.LIFF_CHANNEL_IDS
    delete process.env.ALLOW_DEV_LIFF_AUTH
    const res = fakeRes()
    const next = vi.fn()
    await verifyLiffIdToken({ headers: { authorization: 'Bearer x' } } as never, res as never, next)
    expect(res.statusCode).toBe(503)
    expect(res.body).toEqual({ error: 'liff_not_configured' })
    expect(next).not.toHaveBeenCalled()
  })

  it('answers 401 with no Authorization header', async () => {
    process.env.LIFF_CHANNEL_ID = 'login-channel'
    delete process.env.ALLOW_DEV_LIFF_AUTH
    const res = fakeRes()
    await verifyLiffIdToken({ headers: {} } as never, res as never, vi.fn())
    expect(res.statusCode).toBe(401)
    expect(res.body).toMatchObject({ reason: 'no_authorization_header' })
  })

  it('answers 401 when LINE rejects the token', async () => {
    process.env.LIFF_CHANNEL_ID = 'login-channel'
    delete process.env.ALLOW_DEV_LIFF_AUTH
    global.fetch = vi.fn().mockResolvedValue({ ok: false, status: 400 }) as never
    const res = fakeRes()
    await verifyLiffIdToken({ headers: { authorization: 'Bearer opaque-bad' } } as never, res as never, vi.fn())
    expect(res.statusCode).toBe(401)
  })

  it('sets req.lineUserId and calls next on a good token', async () => {
    process.env.LIFF_CHANNEL_ID = 'login-channel'
    delete process.env.ALLOW_DEV_LIFF_AUTH
    global.fetch = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ sub: 'Ugood' }) }) as never
    const req = { headers: { authorization: `Bearer ${fakeIdToken('login-channel', 'good')}` } } as { headers: object; lineUserId?: string }
    const next = vi.fn()
    await verifyLiffIdToken(req as never, fakeRes() as never, next)
    expect(next).toHaveBeenCalledOnce()
    expect(req.lineUserId).toBe('Ugood')
  })

  it('carries the LINE display name from the ID token', async () => {
    process.env.LIFF_CHANNEL_ID = 'login-channel'
    delete process.env.ALLOW_DEV_LIFF_AUTH
    global.fetch = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ sub: 'Unamed', name: 'พี่วิชัย' }) }) as never
    const req = { headers: { authorization: `Bearer ${fakeIdToken('login-channel', 'named')}` } } as { headers: object; lineUserId?: string; lineDisplayName?: string }
    await verifyLiffIdToken(req as never, fakeRes() as never, vi.fn())
    expect(req.lineUserId).toBe('Unamed')
    expect(req.lineDisplayName).toBe('พี่วิชัย')
  })

  it('carries displayName from /v2/profile on the access-token path, and from the cache', async () => {
    process.env.LIFF_CHANNEL_ID = 'login-channel'
    delete process.env.ALLOW_DEV_LIFF_AUTH
    const fetchMock = vi.fn().mockImplementation((url: string) => {
      if (url.includes('/v2.1/verify?access_token=')) return Promise.resolve({ ok: true, json: async () => ({ client_id: 'login-channel' }) })
      if (url.includes('/v2/profile')) return Promise.resolve({ ok: true, json: async () => ({ userId: 'Uprofile', displayName: 'น้องเอ' }) })
      throw new Error(`unexpected fetch: ${url}`)
    })
    global.fetch = fetchMock as never
    for (let i = 0; i < 2; i++) {
      const req = { headers: { authorization: 'Bearer opaque-named-token' } } as { headers: object; lineDisplayName?: string }
      await verifyLiffIdToken(req as never, fakeRes() as never, vi.fn())
      expect(req.lineDisplayName).toBe('น้องเอ')
    }
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })

  it('leaves the display name unset when LINE gives none', async () => {
    process.env.LIFF_CHANNEL_ID = 'login-channel'
    delete process.env.ALLOW_DEV_LIFF_AUTH
    global.fetch = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ sub: 'Unoname', name: '  ' }) }) as never
    const req = { headers: { authorization: `Bearer ${fakeIdToken('login-channel', 'noname')}` } } as { headers: object; lineDisplayName?: string }
    await verifyLiffIdToken(req as never, fakeRes() as never, vi.fn())
    expect(req.lineDisplayName).toBeUndefined()
  })
})

/**
 * The dev-auth bypass is gated on deployedAs() (K_SERVICE, RAILWAY_SERVICE_NAME
 * or a RAILWAY_*_ID), not NODE_ENV: NODE_ENV is 'staging' on the public
 * staging service.
 */
describe('devAuthBypass: unreachable on a deployed host', () => {
  async function attribute(): Promise<string | undefined> {
    const req = { headers: { authorization: 'Bearer dev-liff' } } as { headers: object; lineUserId?: string }
    let called = false
    await verifyLiffIdToken(req as never, fakeRes() as never, () => {
      called = true
    })
    return called ? req.lineUserId : undefined
  }

  beforeEach(() => {
    delete process.env.K_SERVICE
    delete process.env.RAILWAY_SERVICE_NAME
    delete process.env.RAILWAY_PROJECT_ID
    delete process.env.RAILWAY_ENVIRONMENT_ID
    delete process.env.RAILWAY_SERVICE_ID
    delete process.env.NODE_ENV
    delete process.env.LIFF_CHANNEL_ID
    delete process.env.LIFF_CHANNEL_IDS
    process.env.ALLOW_DEV_LIFF_AUTH = 'true'
    process.env.LIFF_DEV_USER_ID = 'Udevuser'
  })
  afterEach(restoreEnv)

  it('attributes the request locally, even with no Login channel set', async () => {
    expect(await attribute()).toBe('Udevuser')
  })

  it('REFUSES on staging (NODE_ENV=staging plus K_SERVICE)', async () => {
    process.env.NODE_ENV = 'staging'
    process.env.K_SERVICE = 'aquawise-shrimpscan-line-bot-staging'
    expect(await attribute()).toBeUndefined()
  })

  it('REFUSES on any Cloud Run revision even with NODE_ENV unset', async () => {
    process.env.K_SERVICE = 'aquawise-shrimpscan-line-bot'
    expect(await attribute()).toBeUndefined()
  })

  it.each(['RAILWAY_PROJECT_ID', 'RAILWAY_ENVIRONMENT_ID', 'RAILWAY_SERVICE_ID'])('REFUSES on Railway (%s set), where K_SERVICE never is', async (key) => {
    process.env.NODE_ENV = 'staging'
    process.env[key] = 'railway-id'
    expect(await attribute()).toBeUndefined()
  })

  it('boot assertion throws on Railway when the dev vars are set', () => {
    process.env.RAILWAY_SERVICE_ID = 'railway-id'
    expect(() => assertNoDevAuthInDeployedEnv()).toThrow(/REFUSING TO START/)
  })

  it('REFUSES on Railway staging (NODE_ENV=staging plus RAILWAY_SERVICE_NAME)', async () => {
    process.env.NODE_ENV = 'staging'
    process.env.RAILWAY_SERVICE_NAME = 'shrimpscan-line-bot'
    expect(await attribute()).toBeUndefined()
  })

  it('REFUSES with NODE_ENV=production locally', async () => {
    process.env.NODE_ENV = 'production'
    expect(await attribute()).toBeUndefined()
  })

  it('REFUSES unless opted into by its own name', async () => {
    delete process.env.ALLOW_DEV_LIFF_AUTH
    expect(await attribute()).toBeUndefined()
  })

  it('boot assertion throws when a deployed revision carries the dev vars', () => {
    process.env.K_SERVICE = 'aquawise-shrimpscan-line-bot-staging'
    expect(() => assertNoDevAuthInDeployedEnv()).toThrow(/REFUSING TO START/)
  })

  it('boot assertion throws on a Railway deployment that carries the dev vars', () => {
    process.env.RAILWAY_SERVICE_NAME = 'shrimpscan-line-bot'
    expect(() => assertNoDevAuthInDeployedEnv()).toThrow(/REFUSING TO START/)
  })

  it('boot assertion is silent locally and on a clean deployed revision', () => {
    expect(() => assertNoDevAuthInDeployedEnv()).not.toThrow()
    process.env.K_SERVICE = 'aquawise-shrimpscan-line-bot'
    delete process.env.LIFF_DEV_USER_ID
    delete process.env.ALLOW_DEV_LIFF_AUTH
    expect(() => assertNoDevAuthInDeployedEnv()).not.toThrow()
  })
})
