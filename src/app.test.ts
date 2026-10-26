import crypto from 'node:crypto'
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import request from 'supertest'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createApp } from './app.js'

const KEYS = [
  'LINE_CHANNEL_SECRET', 'LINE_CHANNEL_ACCESS_TOKEN', 'LIFF_ID', 'LIFF_CHANNEL_ID', 'LIFF_CHANNEL_IDS',
  'NODE_ENV', 'K_SERVICE', 'ALLOW_DEV_LIFF_AUTH', 'LIFF_DEV_USER_ID',
] as const
const saved: Record<string, string | undefined> = {}
for (const k of KEYS) saved[k] = process.env[k]

beforeEach(() => {
  for (const k of KEYS) delete process.env[k]
})
afterEach(() => {
  for (const k of KEYS) {
    const v = saved[k]
    if (v === undefined) delete process.env[k]
    else process.env[k] = v
  }
})

const SECRET = 'local-test-secret'
const sign = (body: string) => crypto.createHmac('sha256', SECRET).update(body).digest('base64')

function liffFixture(): string {
  const dir = mkdtempSync(path.join(tmpdir(), 'liff-'))
  mkdirSync(path.join(dir, 'assets'))
  writeFileSync(path.join(dir, 'index.html'), '<!doctype html><title>liff</title>')
  writeFileSync(path.join(dir, 'assets', 'app-abc123.js'), 'console.log(1)')
  return dir
}

describe('health and config', () => {
  it('/health answers with no LINE variables at all', async () => {
    const res = await request(createApp()).get('/health')
    expect(res.status).toBe(200)
    expect(res.body.status).toBe('ok')
  })

  it('/api/liff-config is no-store and carries liffId, build_id and env', async () => {
    process.env.LIFF_ID = '1234567890-abcdefgh'
    process.env.NODE_ENV = 'staging'
    const res = await request(createApp()).get('/api/liff-config')
    expect(res.status).toBe(200)
    expect(res.headers['cache-control']).toBe('no-store')
    expect(res.body).toMatchObject({ liffId: '1234567890-abcdefgh', env: 'staging' })
    expect(typeof res.body.build_id).toBe('string')
  })

  it('/api/liff-config still answers with LIFF_ID unset', async () => {
    const res = await request(createApp()).get('/api/liff-config')
    expect(res.status).toBe(200)
    expect(res.body.liffId).toBe('')
  })
})

describe('/webhook', () => {
  const body = JSON.stringify({ destination: 'U0', events: [{ type: 'follow', replyToken: 'r', source: { type: 'user', userId: 'U1' } }] })

  it('answers 503 line_not_configured while LINE_CHANNEL_SECRET is unset', async () => {
    const res = await request(createApp()).post('/webhook').set('content-type', 'application/json').send(body)
    expect(res.status).toBe(503)
    expect(res.body).toEqual({ error: 'line_not_configured' })
  })

  it('answers 400 with no signature header', async () => {
    process.env.LINE_CHANNEL_SECRET = SECRET
    const res = await request(createApp()).post('/webhook').set('content-type', 'application/json').send(body)
    expect(res.status).toBe(400)
  })

  it('answers 403 to a bad signature and handles nothing', async () => {
    process.env.LINE_CHANNEL_SECRET = SECRET
    const onEvents = vi.fn().mockResolvedValue(undefined)
    const res = await request(createApp({ onEvents }))
      .post('/webhook')
      .set('content-type', 'application/json')
      .set('x-line-signature', sign(body + ' '))
      .send(body)
    expect(res.status).toBe(403)
    expect(onEvents).not.toHaveBeenCalled()
  })

  it('answers 200 to a good signature and hands the events on', async () => {
    process.env.LINE_CHANNEL_SECRET = SECRET
    const onEvents = vi.fn().mockResolvedValue(undefined)
    const res = await request(createApp({ onEvents }))
      .post('/webhook')
      .set('content-type', 'application/json')
      .set('x-line-signature', sign(body))
      .send(body)
    expect(res.status).toBe(200)
    expect(onEvents).toHaveBeenCalledOnce()
    expect(onEvents.mock.calls[0]?.[0]).toHaveLength(1)
  })

  it('answers 200 to LINE\'s empty "Verify" call', async () => {
    process.env.LINE_CHANNEL_SECRET = SECRET
    const empty = JSON.stringify({ destination: 'U0', events: [] })
    const res = await request(createApp())
      .post('/webhook')
      .set('content-type', 'application/json')
      .set('x-line-signature', sign(empty))
      .send(empty)
    expect(res.status).toBe(200)
  })
})

describe('/api/liff', () => {
  it('/api/liff/me answers 503 liff_not_configured with no Login channel', async () => {
    const res = await request(createApp()).get('/api/liff/me').set('authorization', 'Bearer x')
    expect(res.status).toBe(503)
    expect(res.body).toEqual({ error: 'liff_not_configured' })
  })

  it('/api/liff/me answers 401 without a token once configured', async () => {
    process.env.LIFF_CHANNEL_ID = '2000000000'
    const res = await request(createApp()).get('/api/liff/me')
    expect(res.status).toBe(401)
  })

  it('/api/liff/me returns a 12-hex tag, never the LINE user id', async () => {
    process.env.ALLOW_DEV_LIFF_AUTH = 'true'
    process.env.LIFF_DEV_USER_ID = 'Udev0000000000000000000000000000'
    process.env.NODE_ENV = 'development'
    const res = await request(createApp()).get('/api/liff/me').set('authorization', 'Bearer dev-liff')
    expect(res.status).toBe(200)
    expect(res.body.ok).toBe(true)
    expect(res.body.env).toBe('development')
    expect(res.body.user).toMatch(/^[0-9a-f]{12}$/)
    expect(JSON.stringify(res.body)).not.toContain('Udev')
  })

  it('a LIFF route that is not built yet answers 501 after auth', async () => {
    process.env.ALLOW_DEV_LIFF_AUTH = 'true'
    process.env.LIFF_DEV_USER_ID = 'Udev0000000000000000000000000000'
    const ok = await request(createApp()).get('/api/liff/overview').set('authorization', 'Bearer dev-liff')
    expect(ok.status).toBe(501)
    const noAuth = await request(createApp()).get('/api/liff/overview')
    expect(noAuth.status).toBe(503)
  })
})

describe('/liff static serving', () => {
  it('serves /liff and /liff/ directly (no 301) and deep links fall back to index.html', async () => {
    const app = createApp({ liffDir: liffFixture() })
    for (const p of ['/liff', '/liff/', '/liff/app/scan']) {
      const res = await request(app).get(p)
      expect(res.status).toBe(200)
      expect(res.text).toContain('<title>liff</title>')
      // Never no-store or no-cache on the document: that loops the LINE login.
      expect(String(res.headers['cache-control'] ?? '')).not.toMatch(/no-store|no-cache/)
    }
  })

  it('caches hashed /liff/assets immutable', async () => {
    const res = await request(createApp({ liffDir: liffFixture() })).get('/liff/assets/app-abc123.js')
    expect(res.status).toBe(200)
    expect(res.headers['cache-control']).toContain('immutable')
  })
})
