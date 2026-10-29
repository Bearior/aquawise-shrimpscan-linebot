import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const sdk = vi.hoisted(() => ({ login: vi.fn(), logout: vi.fn() }))
vi.mock('@line/liff', () => ({ default: sdk }))

const { idTokenFresh, renewLoginOnce } = await import('./login-guard')

const NOW = Date.UTC(2026, 9, 29, 8, 48)
const MIN = 60 * 1000

function at(href: string) {
  const url = new URL(href)
  vi.stubGlobal('window', { location: { href: url.toString(), search: url.search } })
}

describe('idTokenFresh', () => {
  it('takes a token with more than five minutes left', () => {
    expect(idTokenFresh((NOW + 30 * MIN) / 1000, NOW)).toBe(true)
  })

  it('refuses one past its exp, or about to be', () => {
    expect(idTokenFresh((NOW - 34 * MIN) / 1000, NOW)).toBe(false)
    expect(idTokenFresh((NOW + 2 * MIN) / 1000, NOW)).toBe(false)
  })

  it('leaves a token with no exp to the server', () => {
    expect(idTokenFresh(undefined, NOW)).toBe(true)
  })
})

describe('renewLoginOnce', () => {
  beforeEach(() => {
    const store = new Map<string, string>()
    vi.stubGlobal('localStorage', {
      getItem: (k: string) => store.get(k) ?? null,
      setItem: (k: string, v: string) => void store.set(k, v),
      removeItem: (k: string) => void store.delete(k),
    })
  })
  afterEach(() => {
    vi.unstubAllGlobals()
    sdk.login.mockReset()
    sdk.logout.mockReset()
  })

  it('drops the stored login and goes round LINE Login, keeping the invite', () => {
    at('https://scan.example/liff/app/join?invite=7K2P9QX&code=abc&state=xyz')
    expect(renewLoginOnce()).toBe(true)
    expect(sdk.logout).toHaveBeenCalledTimes(1)
    const { redirectUri } = sdk.login.mock.calls[0]![0] as { redirectUri: string }
    const back = new URL(redirectUri)
    expect(back.searchParams.get('invite')).toBe('7K2P9QX')
    expect(back.searchParams.get('_liffRetry')).toBe('1')
    expect(back.searchParams.has('code')).toBe(false)
  })

  it('goes round once: a second expired boot inside the TTL renders instead', () => {
    at('https://scan.example/liff/app')
    expect(renewLoginOnce()).toBe(true)
    expect(renewLoginOnce()).toBe(false)
    expect(sdk.login).toHaveBeenCalledTimes(1)
  })

  it('never goes round again on the way back from LINE Login', () => {
    at('https://scan.example/liff/app?_liffRetry=1')
    expect(renewLoginOnce()).toBe(false)
    expect(sdk.login).not.toHaveBeenCalled()
  })
})
