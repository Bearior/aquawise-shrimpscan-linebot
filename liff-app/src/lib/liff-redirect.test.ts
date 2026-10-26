import { describe, expect, it } from 'vitest'
import { isPendingLiffOAuthCallback, resolveDefaultRedirect } from './liff-redirect'

const go = (qs: string) => resolveDefaultRedirect(new URLSearchParams(qs))

describe('resolveDefaultRedirect', () => {
  it('lands on the app home with nothing to forward', () => {
    expect(go('')).toBe('/liff/app')
  })

  it('forwards a rich-menu path from liff.state', () => {
    expect(go('liff.state=%2Fapp%2Fscan')).toBe('/liff/app/scan')
  })

  it('keeps the query that rode inside liff.state', () => {
    expect(go('liff.state=%2Fapp%2Fjoin%3Finvite%3D7K2P9QX')).toBe('/liff/app/join?invite=7K2P9QX')
  })

  it('drops a trailing slash', () => {
    expect(go('liff.state=%2Fapp%2Ftoday%2F')).toBe('/liff/app/today')
  })

  it('never follows liff.state outside /app', () => {
    expect(go('liff.state=%2Fadmin')).toBe('/liff/app')
    expect(go('liff.state=%2Fapplesauce')).toBe('/liff/app')
    expect(go('liff.state=https%3A%2F%2Fevil.example%2Fapp')).toBe('/liff/app')
  })

  it('sends a bare invite on the endpoint to the join screen', () => {
    expect(go('invite=7K2P9QX')).toBe('/liff/app/join?invite=7K2P9QX')
  })

  it("drops LINE's own params and never mistakes the OAuth code for an invite", () => {
    expect(go('code=abc&state=xyz&liffClientId=1&invite=7K2P9QX')).toBe('/liff/app/join?invite=7K2P9QX')
    expect(go('code=abc&state=xyz')).toBe('/liff/app')
  })
})

describe('isPendingLiffOAuthCallback', () => {
  it('is true only with a code and one of LINE’s callback markers', () => {
    expect(isPendingLiffOAuthCallback(new URLSearchParams('code=abc&state=x'))).toBe(true)
    expect(isPendingLiffOAuthCallback(new URLSearchParams('code=abc&liffClientId=1'))).toBe(true)
    expect(isPendingLiffOAuthCallback(new URLSearchParams('code=abc'))).toBe(false)
    expect(isPendingLiffOAuthCallback(new URLSearchParams('invite=7K2P9QX'))).toBe(false)
  })
})
