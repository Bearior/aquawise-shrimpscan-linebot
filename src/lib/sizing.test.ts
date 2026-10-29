import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { detectRim, measure } from './sizing.js'

const KEYS = ['SIZING_SERVICE_URL', 'SIZING_SERVICE_SECRET'] as const
const saved: Record<string, string | undefined> = {}
for (const k of KEYS) saved[k] = process.env[k]

const fetchMock = vi.fn<typeof fetch>()
const IMG = Buffer.from([0xff, 0xd8, 0xff, 0xd9])

beforeEach(() => {
  process.env.SIZING_SERVICE_URL = 'https://sizing.test/'
  process.env.SIZING_SERVICE_SECRET = 'test-secret'
  fetchMock.mockReset()
  vi.stubGlobal('fetch', fetchMock)
})
afterEach(() => {
  vi.unstubAllGlobals()
  for (const k of KEYS) {
    const v = saved[k]
    if (v === undefined) delete process.env[k]
    else process.env[k] = v
  }
})

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })
const RIM = { found: true, ring: [0.5, 0.52, 0.38, 0.36, 0], source: 'M1', confidence: 0.91, working_px: [520, 461], pipeline_version: 'p1' }
const MEASURE = { run_id: 'r1', status: 'ok', retake_reason: null, error_code: null, pipeline_version: 'p1', diameter_provisional: false, flags: ['hand_rim'], px_lengths: [10, 11], rim_radius_px: 480, sam3_calls: 1, sam3_http_attempts: 1, estimate: { abw_g: 13.9 }, versions: { pipeline: 'p1' } }

describe('the sizing client', () => {
  it('is not configured without a URL or a secret, and calls nothing', async () => {
    delete process.env.SIZING_SERVICE_URL
    expect(await detectRim(IMG, 'image/jpeg')).toEqual({ ok: false, code: 'NOT_CONFIGURED' })
    process.env.SIZING_SERVICE_URL = 'https://sizing.test'
    delete process.env.SIZING_SERVICE_SECRET
    expect(await measure(IMG, 'image/jpeg', { diameterCm: 82, rimEllipse: [0.5, 0.5, 0.4, 0.4, 0] })).toEqual({ ok: false, code: 'NOT_CONFIGURED' })
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('finds the rim: POST /v1/rim with the photo and the secret', async () => {
    fetchMock.mockResolvedValueOnce(json(RIM))
    const r = await detectRim(IMG, 'image/jpeg')
    expect(r).toEqual({ ok: true, data: RIM })
    const [url, init] = fetchMock.mock.calls[0]!
    expect(url).toBe('https://sizing.test/v1/rim')
    expect((init!.headers as Record<string, string>).Authorization).toBe('Bearer test-secret')
    expect((init!.body as FormData).get('image')).toBeInstanceOf(Blob)
  })

  it('measures on the farmer ring: diameter_cm, rim_ellipse JSON and rim_source farmer', async () => {
    fetchMock.mockResolvedValueOnce(json(MEASURE))
    const ring: [number, number, number, number, number] = [0.5, 0.52, 0.38, 0.36, 0.1]
    const r = await measure(IMG, 'image/png', { diameterCm: 82, rimEllipse: ring, runId: 'scan-1' })
    expect(r.ok).toBe(true)
    const [url, init] = fetchMock.mock.calls[0]!
    expect(url).toBe('https://sizing.test/v1/measure')
    const form = init!.body as FormData
    expect(form.get('diameter_cm')).toBe('82')
    expect(JSON.parse(String(form.get('rim_ellipse')))).toEqual(ring)
    expect(form.get('rim_source')).toBe('farmer')
    expect(form.get('run_id')).toBe('scan-1')
    expect((form.get('image') as Blob).type).toBe('image/png')
  })

  it('a 500 is a failure, asked once: a measure is never retried', async () => {
    fetchMock.mockResolvedValue(new Response('boom', { status: 500 }))
    expect(await measure(IMG, 'image/jpeg', { diameterCm: 82, rimEllipse: [0.5, 0.5, 0.4, 0.4, 0] })).toEqual({ ok: false, code: 'ERROR', httpStatus: 500 })
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('a body outside the contract is a failure', async () => {
    fetchMock.mockResolvedValueOnce(json({ found: 'yes' }))
    expect((await detectRim(IMG, 'image/jpeg')).ok).toBe(false)
    fetchMock.mockResolvedValueOnce(json({ status: 'ok', pipeline_version: 'p1', px_lengths: [] }))
    expect((await measure(IMG, 'image/jpeg', { diameterCm: 82, rimEllipse: [0.5, 0.5, 0.4, 0.4, 0] })).ok).toBe(false)
  })

  it('a service that does not answer in time is TIMEOUT', async () => {
    fetchMock.mockImplementationOnce(
      (_url, init) =>
        new Promise((_resolve, reject) => {
          init!.signal!.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError')))
        }),
    )
    expect(await detectRim(IMG, 'image/jpeg', { timeoutMs: 20 })).toEqual({ ok: false, code: 'TIMEOUT' })
  })

  it('a network failure is ERROR, never a throw', async () => {
    fetchMock.mockRejectedValueOnce(new TypeError('fetch failed'))
    expect(await detectRim(IMG, 'image/jpeg')).toEqual({ ok: false, code: 'ERROR' })
  })
})
