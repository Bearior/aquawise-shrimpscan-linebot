import { afterEach, describe, expect, it, vi } from 'vitest'

vi.mock('@line/liff', () => ({
  default: { getIDToken: () => 'id-token-1', getAccessToken: () => 'access-1' },
}))

const { apiFetch, ApiAuthError, ApiError } = await import('./api-fetch')

function reply(status: number, body?: unknown) {
  return vi.fn(async () => new Response(body === undefined ? null : JSON.stringify(body), { status }))
}

describe('apiFetch', () => {
  afterEach(() => vi.unstubAllGlobals())

  it('sends the LIFF ID token and a JSON body, never a user id', async () => {
    const f = reply(200, { ok: true })
    vi.stubGlobal('fetch', f)
    await apiFetch('/api/liff/start', { method: 'POST', body: { name: 'ฟาร์ม' } })
    const [, init] = f.mock.calls[0] as unknown as [string, RequestInit]
    const headers = init.headers as Record<string, string>
    expect(headers.Authorization).toBe('Bearer id-token-1')
    expect(headers['Content-Type']).toBe('application/json')
    expect(headers['x-mock-persona']).toBeUndefined()
    expect(init.body).toBe('{"name":"ฟาร์ม"}')
  })

  it('turns a 401 into ApiAuthError', async () => {
    vi.stubGlobal('fetch', reply(401, { error: 'unauthorized' }))
    await expect(apiFetch('/api/liff/session')).rejects.toBeInstanceOf(ApiAuthError)
  })

  it("carries the server's error code", async () => {
    vi.stubGlobal('fetch', reply(402, { error: 'no_credits' }))
    const e = await apiFetch('/api/liff/scans/s1/measure').catch((x: unknown) => x)
    expect(e).toBeInstanceOf(ApiError)
    expect((e as InstanceType<typeof ApiError>).message).toBe('no_credits')
    expect((e as InstanceType<typeof ApiError>).status).toBe(402)
  })

  it('answers undefined for 204', async () => {
    vi.stubGlobal('fetch', reply(204))
    expect(await apiFetch('/api/liff/invites/X', { method: 'DELETE' })).toBeUndefined()
  })
})
